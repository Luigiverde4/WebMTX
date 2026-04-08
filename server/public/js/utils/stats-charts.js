/**
 * DASHBOARD STATS - CALCULO, RENDER Y GRAFICOS
 * Funciones de procesamiento de datos y actualizacion de UI/charts.
 */

// INICIALIZACION DE GRAFICOS
/**
 * Crea los graficos globales del dashboard (total, combinado por stream y readers).
 */
function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js no esta disponible, se omiten los graficos.');
        return;
    }

    let throughputCtx = document.getElementById('totalThroughputChart');
    let streamThroughputCtx = document.getElementById('streamThroughputChart');
    let readersCtx = document.getElementById('readersByPathChart');

    throughputChart = new Chart(throughputCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Entrada (Mbps)',
                    data: [],
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.15)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25,
                    fill: true
                },
                {
                    label: 'Salida (Mbps)',
                    data: [],
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96, 165, 250, 0.15)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.25,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                y: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true }
            },
            plugins: {
                legend: { labels: { color: '#ecf3ff' } }
            }
        }
    });

    streamThroughputChart = new Chart(streamThroughputCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                y: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true }
            },
            plugins: {
                legend: { labels: { color: '#ecf3ff' } }
            }
        }
    });

    readersChart = new Chart(readersCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Readers',
                    data: [],
                    backgroundColor: '#fbbf24',
                    borderColor: '#f59e0b',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                y: {
                    ticks: { color: '#a8b3c9', precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: { labels: { color: '#ecf3ff' } }
            }
        }
    });
}

// CALCULOS 
/**
 * Calcula throughput global y por stream a partir del delta de bytes entre muestras.
 * @param {Array<object>} items - Paths devueltos por la API de MediaMTX.
 * @param {number} nowMs - Timestamp actual en milisegundos.
 * @returns {{inMbps:number, outMbps:number, perStream:Array<{name:string,inMbps:number,outMbps:number,mbps:number}>}}
 */
function computeThroughput(items, nowMs) {
    let inBps = 0;
    let outBps = 0;
    let perStream = [];

    items.forEach(path => {
        let name = path.name || '';
        let prev = previousPathSample.get(name);

        if (prev) {
            let dt = (nowMs - prev.ts) / 1000;
            if (dt > 0) {
                let rxDelta = Math.max(0, (path.bytesReceived || 0) - prev.bytesReceived);
                let txDelta = Math.max(0, (path.bytesSent || 0) - prev.bytesSent);
                inBps += (rxDelta * 8) / dt;
                outBps += (txDelta * 8) / dt;

                perStream.push({
                    name,
                    inMbps: (rxDelta * 8) / dt / 1000000,
                    outMbps: (txDelta * 8) / dt / 1000000,
                    mbps: ((rxDelta + txDelta) * 8) / dt / 1000000
                });
            }
        }

        previousPathSample.set(name, {
            bytesReceived: path.bytesReceived || 0,
            bytesSent: path.bytesSent || 0,
            ts: nowMs
        });
    });

    return {
        inMbps: inBps / 1000000,
        outMbps: outBps / 1000000,
        perStream
    };
}


/**
 * Calcula min, media y maximo de una serie numerica.
 * @param {number[]} series - Serie historica.
 * @returns {{min:number, avg:number, max:number}}
 */
function computeSeriesMetrics(series) {
    if (!Array.isArray(series) || series.length === 0) {
        return { min: 0, avg: 0, max: 0 };
    }

    let min = Math.min(...series);
    let max = Math.max(...series);
    let avg = series.reduce((sum, value) => sum + value, 0) / series.length;
    return {
        min: Number(min.toFixed(3)),
        avg: Number(avg.toFixed(3)),
        max: Number(max.toFixed(3))
    };
}


// CICLO DE ACTUALIZACION
/**
 * Renderiza/actualiza una section por stream con metadatos y chart de 3 lineas.
 * @param {Array<object>} items - Paths activos.
 * @param {string[]} labels - Etiquetas temporales.
 */
function updateStreamBlocks(items, labels) {
    if (!streamSectionsContainerEl || typeof Chart === 'undefined') return;

    if (!items || items.length === 0) {
        streamSectionsContainerEl.innerHTML = '<div class="empty-state">No hay streams activos ahora mismo</div>';
        perStreamChartInstances.forEach(chart => chart.destroy());
        perStreamChartInstances.clear();
        return;
    }

    // Limpia el placeholder inicial de carga para que no conviva con las secciones reales.
    streamSectionsContainerEl.querySelectorAll('.empty-state').forEach(node => node.remove());

    let itemsByName = new Map(items.map(path => [path.name || 'sin nombre', path]));
    let streamNames = [...itemsByName.keys()];
    let wantedIds = new Set(streamNames.map(obtenerIdCanvasStream));
    let wantedBlockIds = new Set(streamNames.map(obtenerIdBloqueStream));

    perStreamChartInstances.forEach((chart, canvasId) => {
        if (!wantedIds.has(canvasId)) {
            chart.destroy();
            perStreamChartInstances.delete(canvasId);
        }
    });

    streamSectionsContainerEl.querySelectorAll('.stream-section').forEach(card => {
        if (!wantedBlockIds.has(card.id)) {
            card.remove();
        }
    });

    streamNames.forEach((streamName, index) => {
        let path = itemsByName.get(streamName);
        let readersCount = Array.isArray(path.readers) ? path.readers.length : 0;
        let sourceType = path.source && path.source.type ? path.source.type : '-';
        let sourceId = path.source && path.source.id ? path.source.id : '-';
        let tracks = Array.isArray(path.tracks) ? path.tracks : [];

        let canvasId = obtenerIdCanvasStream(streamName);
        let blockId = obtenerIdBloqueStream(streamName);
        let cardEl = document.getElementById(blockId);

        if (!cardEl) {
            cardEl = document.createElement('section');
            cardEl.className = 'stream-section';
            cardEl.id = blockId;
            cardEl.innerHTML = `
                <div class="path-top">
                    <div class="path-name">${escapeHtml(streamName)}</div>
                    <span id="status-${canvasId}" class="status-pill ${path.ready ? 'status-ready' : 'status-off'}">${path.ready ? 'READY' : 'NO READY'}</span>
                </div>

                <div class="path-meta">
                    <div class="meta-item">
                        <div class="meta-label">Online</div>
                        <div id="online-${canvasId}" class="meta-value">${path.online ? 'Si' : 'No'}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Readers</div>
                        <div id="readers-${canvasId}" class="meta-value">${readersCount}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Bytes recibidos</div>
                        <div id="rx-${canvasId}" class="meta-value">${formatBytes(path.bytesReceived || 0)}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Bytes enviados</div>
                        <div id="tx-${canvasId}" class="meta-value">${formatBytes(path.bytesSent || 0)}</div>
                    </div>
                </div>

                <div class="meta-item" style="margin-bottom: 8px;">
                    <div class="meta-label">Source</div>
                    <div id="source-${canvasId}" class="meta-value">${escapeHtml(sourceType)} (${escapeHtml(sourceId)})</div>
                </div>

                <div class="tracks" id="tracks-${canvasId}">
                    ${tracks.length > 0 ? tracks.map(track => `<span class="track">${escapeHtml(track)}</span>`).join('') : '<span class="track">Sin tracks</span>'}
                </div>

                <div class="stream-chart-wrap">
                    <canvas id="${canvasId}"></canvas>
                </div>

                <div class="throughput-stats">
                    <div class="throughput-stat">
                        <div class="meta-label">Throughput min</div>
                        <div id="min-${canvasId}" class="meta-value">0.000 Mbps</div>
                    </div>
                    <div class="throughput-stat">
                        <div class="meta-label">Throughput medio</div>
                        <div id="avg-${canvasId}" class="meta-value">0.000 Mbps</div>
                    </div>
                    <div class="throughput-stat">
                        <div class="meta-label">Throughput max</div>
                        <div id="max-${canvasId}" class="meta-value">0.000 Mbps</div>
                    </div>
                </div>
            `;
            streamSectionsContainerEl.appendChild(cardEl);
        }

        let statusEl = document.getElementById(`status-${canvasId}`);
        if (statusEl) {
            statusEl.textContent = path.ready ? 'READY' : 'NO READY';
            statusEl.className = `status-pill ${path.ready ? 'status-ready' : 'status-off'}`;
        }

        ponerTextoPorId(`online-${canvasId}`, path.online ? 'Si' : 'No');
        ponerTextoPorId(`readers-${canvasId}`, String(readersCount));
        ponerTextoPorId(`rx-${canvasId}`, formatBytes(path.bytesReceived || 0));
        ponerTextoPorId(`tx-${canvasId}`, formatBytes(path.bytesSent || 0));
        ponerTextoPorId(`source-${canvasId}`, `${sourceType} (${sourceId})`);

        let tracksEl = document.getElementById(`tracks-${canvasId}`);
        if (tracksEl) {
            tracksEl.innerHTML = tracks.length > 0
                ? tracks.map(track => `<span class="track">${escapeHtml(track)}</span>`).join('')
                : '<span class="track">Sin tracks</span>';
        }

        let totalSeries = allStreamThroughputSeries.get(streamName) || [];
        let inputSeries = allStreamInputSeries.get(streamName) || [];
        let outputSeries = allStreamOutputSeries.get(streamName) || [];
        let stats = computeSeriesMetrics(totalSeries);
        ponerTextoPorId(`min-${canvasId}`, `${stats.min.toFixed(3)} Mbps`);
        ponerTextoPorId(`avg-${canvasId}`, `${stats.avg.toFixed(3)} Mbps`);
        ponerTextoPorId(`max-${canvasId}`, `${stats.max.toFixed(3)} Mbps`);

        let chart = perStreamChartInstances.get(canvasId);
        if (!chart) {
            let ctx = document.getElementById(canvasId);
            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Entrada',
                            data: inputSeries,
                            borderColor: '#4ade80',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.25,
                            fill: false
                        },
                        {
                            label: 'Salida',
                            data: outputSeries,
                            borderColor: '#60a5fa',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.25,
                            fill: false
                        },
                        {
                            label: 'Throughput',
                            data: totalSeries,
                            borderColor: '#f59e0b',
                            borderWidth: 2,
                            pointRadius: 0,
                            tension: 0.25,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        x: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                        y: { ticks: { color: '#a8b3c9' }, grid: { color: 'rgba(255,255,255,0.08)' }, beginAtZero: true }
                    },
                    plugins: {
                        legend: { labels: { color: '#ecf3ff' } }
                    }
                }
            });
            perStreamChartInstances.set(canvasId, chart);
        } else {
            chart.data.labels = labels;
            chart.data.datasets[0].data = inputSeries;
            chart.data.datasets[1].data = outputSeries;
            chart.data.datasets[2].data = totalSeries;
            chart.update('none');
        }
    });
}

/**
 * Mantiene las series temporales por stream para entrada, salida y throughput total.
 * @param {Array<object>} items - Paths devueltos por la API.
 * @param {Array<object>} perStream - Muestras por stream del ciclo actual.
 * @param {number} labelsLen - Numero de etiquetas activas en el eje temporal.
 */
function updateAllStreamSeries(items, perStream, labelsLen) {
    let currentNames = new Set(items.map(path => path.name || 'sin nombre'));
    let valueByName = new Map(perStream.map(stream => [stream.name || 'sin nombre', {
        inMbps: stream.inMbps || 0,
        outMbps: stream.outMbps || 0,
        mbps: stream.mbps || 0
    }]));

    allStreamThroughputSeries.forEach((_, streamName) => {
        if (!currentNames.has(streamName)) {
            allStreamThroughputSeries.delete(streamName);
            allStreamInputSeries.delete(streamName);
            allStreamOutputSeries.delete(streamName);
        }
    });

    currentNames.forEach(streamName => {
        if (!allStreamThroughputSeries.has(streamName)) {
            allStreamThroughputSeries.set(streamName, new Array(Math.max(0, labelsLen - 1)).fill(0));
        }
        if (!allStreamInputSeries.has(streamName)) {
            allStreamInputSeries.set(streamName, new Array(Math.max(0, labelsLen - 1)).fill(0));
        }
        if (!allStreamOutputSeries.has(streamName)) {
            allStreamOutputSeries.set(streamName, new Array(Math.max(0, labelsLen - 1)).fill(0));
        }

        let sample = valueByName.get(streamName) || { inMbps: 0, outMbps: 0, mbps: 0 };
        let totalSeries = allStreamThroughputSeries.get(streamName);
        let inputSeries = allStreamInputSeries.get(streamName);
        let outputSeries = allStreamOutputSeries.get(streamName);

        totalSeries.push(Number(sample.mbps.toFixed(3)));
        inputSeries.push(Number(sample.inMbps.toFixed(3)));
        outputSeries.push(Number(sample.outMbps.toFixed(3)));

        while (totalSeries.length > labelsLen) {
            totalSeries.shift();
        }
        while (inputSeries.length > labelsLen) {
            inputSeries.shift();
        }
        while (outputSeries.length > labelsLen) {
            outputSeries.shift();
        }
    });
}

/**
 * Actualiza el grafico combinado con los streams mas activos del momento.
 * @param {string[]} labels - Etiquetas temporales del eje X.
 */
function updateCombinedStreamThroughputChart(labels) {
    if (!streamThroughputChart) return;

    let topStreams = [...allStreamThroughputSeries.entries()]
        .map(([name, series]) => ({ name, latest: series.length > 0 ? series[series.length - 1] : 0 }))
        .sort((a, b) => b.latest - a.latest)
        .slice(0, MAX_STREAM_DATASETS)
        .map(item => item.name);

    streamThroughputChart.data.labels = labels;
    streamThroughputChart.data.datasets = topStreams.map((streamName, index) => ({
        label: streamName,
        data: allStreamThroughputSeries.get(streamName),
        borderColor: STREAM_COLORS[index % STREAM_COLORS.length],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
        fill: false
    }));
    streamThroughputChart.update('none');
}

/**
 * Actualiza todas las visualizaciones del dashboard con un nuevo muestreo.
 * @param {Array<object>} items - Paths activos devueltos por API.
 */
function updateCharts(items) {
    if (!throughputChart || !readersChart) return;

    let nowMs = Date.now();
    let throughput = computeThroughput(items, nowMs);
    let label = new Date(nowMs).toLocaleTimeString();

    throughputHistory.push({
        label,
        inMbps: Number(throughput.inMbps.toFixed(3)),
        outMbps: Number(throughput.outMbps.toFixed(3))
    });

    if (throughputHistory.length > MAX_HISTORY_POINTS) {
        throughputHistory.shift();
    }

    throughputChart.data.labels = throughputHistory.map(point => point.label);
    throughputChart.data.datasets[0].data = throughputHistory.map(point => point.inMbps);
    throughputChart.data.datasets[1].data = throughputHistory.map(point => point.outMbps);
    throughputChart.update('none');

    updateAllStreamSeries(items, throughput.perStream, throughputChart.data.labels.length);
    updateCombinedStreamThroughputChart(throughputChart.data.labels);
    updateStreamBlocks(items, throughputChart.data.labels);

    readersChart.data.labels = items.map(path => path.name || 'sin nombre');
    readersChart.data.datasets[0].data = items.map(path => (Array.isArray(path.readers) ? path.readers.length : 0));
    readersChart.update('none');
}



// UTILS
/**
 * Formatea una fecha ISO a formato local legible.
 * @param {string|undefined} isoDate - Fecha en formato ISO.
 * @returns {string}
 */
function formatDateTime(isoDate) {
    if (!isoDate) return '-';
    let parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
}

