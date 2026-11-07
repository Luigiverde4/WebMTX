/**
 * DASHBOARD STATS - CALCULO, RENDER Y GRAFICOS
 * Funciones de procesamiento de datos y actualizacion de UI/charts.
 *
 * Color: cada cámara usa su color de identidad (js/utils/camaras.js), igual que
 * en el resto de páginas. Entrada y salida se distinguen por el trazo
 * (continuo / discontinuo) además de por la leyenda, nunca solo por color.
 */

const TRAZO_SALIDA = [6, 4];

/**
 * Lee un token de color de base.css.
 * @param {string} nombre - p. ej. '--texto-2'
 * @param {string} respaldo
 */
function tokenColor(nombre, respaldo) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || respaldo;
}

function coloresGraficas() {
    return {
        texto: tokenColor('--texto', '#e6ebf0'),
        texto2: tokenColor('--texto-2', '#93a1b0'),
        texto3: tokenColor('--texto-3', '#6f7d8c'),
        rejilla: tokenColor('--linea-suave', '#2f3945'),
        superficie: tokenColor('--superficie-2', '#2b3540')
    };
}

/**
 * Opciones comunes: una sola escala Y, rejilla discreta, tooltip con todas las
 * series del instante bajo el cursor (crosshair por índice).
 * @param {{enteros?: boolean, leyenda?: boolean}} [config]
 */
function opcionesGrafica({ enteros = false, leyenda = true } = {}) {
    let c = coloresGraficas();
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
            x: {
                ticks: { color: c.texto2, maxTicksLimit: 6, maxRotation: 0 },
                grid: { display: false },
                border: { color: c.rejilla }
            },
            y: {
                beginAtZero: true,
                ticks: { color: c.texto2, maxTicksLimit: 5, precision: enteros ? 0 : undefined },
                grid: { color: c.rejilla },
                border: { display: false }
            }
        },
        plugins: {
            legend: {
                display: leyenda,
                align: 'start',
                labels: { color: c.texto, usePointStyle: true, pointStyle: 'line', boxWidth: 24, padding: 12 }
            },
            tooltip: {
                backgroundColor: c.superficie,
                titleColor: c.texto,
                bodyColor: c.texto,
                borderColor: c.rejilla,
                borderWidth: 1,
                padding: 10,
                boxPadding: 4,
                usePointStyle: true
            }
        },
        elements: {
            line: { borderWidth: 2, tension: 0.25 },
            point: { radius: 0, hoverRadius: 4, hitRadius: 8 }
        }
    };
}

// INICIALIZACION DE GRAFICOS
/**
 * Crea los graficos globales del dashboard (total, combinado por stream y readers).
 */
function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js no esta disponible, se omiten los graficos.');
        let aviso = document.getElementById('avisoGraficas');
        if (aviso) aviso.hidden = false;
        return;
    }

    let c = coloresGraficas();
    Chart.defaults.font.family = 'Archivo, "Segoe UI", system-ui, sans-serif';

    throughputChart = new Chart(document.getElementById('totalThroughputChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Entrada', data: [], borderColor: c.texto, backgroundColor: c.texto },
                { label: 'Salida', data: [], borderColor: c.texto2, backgroundColor: c.texto2, borderDash: TRAZO_SALIDA }
            ]
        },
        options: opcionesGrafica()
    });

    streamThroughputChart = new Chart(document.getElementById('streamThroughputChart'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: opcionesGrafica()
    });

    readersChart = new Chart(document.getElementById('readersByPathChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{ label: 'Espectadores', data: [], backgroundColor: [], borderRadius: 4, maxBarThickness: 36 }]
        },
        options: opcionesGrafica({ enteros: true, leyenda: false })
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

function formatoMbps(valor) {
    return `${valor.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbps`;
}

function htmlPistas(tracks) {
    return tracks.length > 0
        ? tracks.map(track => `<span class="pista">${escapeHtml(typeof track === 'string' ? track : track?.codec || '?')}</span>`).join('')
        : '<span class="pista">Sin pistas</span>';
}


// CICLO DE ACTUALIZACION
/**
 * Renderiza/actualiza una sección por stream con metadatos y, si hay Chart.js,
 * su gráfica de entrada/salida/total. Las secciones se pintan siempre.
 * @param {Array<object>} items - Paths activos.
 * @param {string[]} labels - Etiquetas temporales.
 */
function updateStreamBlocks(items, labels) {
    if (!streamSectionsContainerEl) return;
    let hayGraficas = typeof Chart !== 'undefined';

    if (!items || items.length === 0) {
        streamSectionsContainerEl.innerHTML = '<div class="vacio"><strong>No hay ningún path en MediaMTX.</strong> Las cámaras aparecen aquí en cuanto empiezan a emitir.</div>';
        perStreamChartInstances.forEach(chart => chart.destroy());
        perStreamChartInstances.clear();
        return;
    }

    // Limpia el placeholder inicial de carga o de error para que no conviva con las secciones reales.
    streamSectionsContainerEl.querySelectorAll('.vacio').forEach(node => node.remove());

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

    streamSectionsContainerEl.querySelectorAll('.seccion-camara').forEach(card => {
        if (!wantedBlockIds.has(card.id)) {
            card.remove();
        }
    });

    streamNames.forEach(streamName => {
        let path = itemsByName.get(streamName);
        let readersCount = Array.isArray(path.readers) ? path.readers.length : 0;
        let sourceType = path.source && path.source.type ? path.source.type : '—';
        let sourceId = path.source && path.source.id ? path.source.id : '';
        let tracks = Array.isArray(path.tracks) ? path.tracks : [];

        let canvasId = obtenerIdCanvasStream(streamName);
        let blockId = obtenerIdBloqueStream(streamName);
        let cardEl = document.getElementById(blockId);

        if (!cardEl) {
            cardEl = document.createElement('section');
            cardEl.className = 'seccion-camara panel';
            cardEl.id = blockId;
            aplicarColorCamara(cardEl, streamName);
            cardEl.innerHTML = `
                <header class="seccion-camara__cabecera">
                    <span class="punto-camara" aria-hidden="true"></span>
                    <h3>${escapeHtml(streamName)}</h3>
                    <span id="status-${canvasId}" class="estado"></span>
                </header>

                <dl class="datos seccion-camara__datos">
                    <dt>Online</dt><dd id="online-${canvasId}"></dd>
                    <dt>Espectadores</dt><dd id="readers-${canvasId}"></dd>
                    <dt>Recibido</dt><dd id="rx-${canvasId}"></dd>
                    <dt>Enviado</dt><dd id="tx-${canvasId}"></dd>
                    <dt>Origen</dt><dd id="source-${canvasId}"></dd>
                </dl>

                <div class="pistas" id="tracks-${canvasId}"></div>

                ${hayGraficas ? `<div class="grafica__lienzo grafica__lienzo--peq"><canvas id="${canvasId}" role="img" aria-label="Tráfico de ${escapeHtml(streamName)} en Mbps"></canvas></div>` : ''}

                <dl class="seccion-camara__metricas">
                    <div><dt>Mínimo</dt><dd id="min-${canvasId}" class="cifra">—</dd></div>
                    <div><dt>Media</dt><dd id="avg-${canvasId}" class="cifra">—</dd></div>
                    <div><dt>Máximo</dt><dd id="max-${canvasId}" class="cifra">—</dd></div>
                </dl>
            `;
            streamSectionsContainerEl.appendChild(cardEl);
        }

        let statusEl = document.getElementById(`status-${canvasId}`);
        if (statusEl) {
            statusEl.textContent = path.ready ? 'Listo' : 'No listo';
            statusEl.className = `estado estado--${path.ready ? 'ok' : 'aviso'}`;
        }

        ponerTextoPorId(`online-${canvasId}`, path.online ? 'Sí' : 'No');
        ponerTextoPorId(`readers-${canvasId}`, String(readersCount));
        ponerTextoPorId(`rx-${canvasId}`, formatBytes(path.bytesReceived || 0));
        ponerTextoPorId(`tx-${canvasId}`, formatBytes(path.bytesSent || 0));
        ponerTextoPorId(`source-${canvasId}`, sourceId ? `${sourceType} (${sourceId})` : sourceType);

        let tracksEl = document.getElementById(`tracks-${canvasId}`);
        if (tracksEl) {
            let html = htmlPistas(tracks);
            if (tracksEl.innerHTML !== html) tracksEl.innerHTML = html;
        }

        let totalSeries = allStreamThroughputSeries.get(streamName) || [];
        let inputSeries = allStreamInputSeries.get(streamName) || [];
        let outputSeries = allStreamOutputSeries.get(streamName) || [];
        let stats = computeSeriesMetrics(totalSeries);
        ponerTextoPorId(`min-${canvasId}`, formatoMbps(stats.min));
        ponerTextoPorId(`avg-${canvasId}`, formatoMbps(stats.avg));
        ponerTextoPorId(`max-${canvasId}`, formatoMbps(stats.max));

        if (!hayGraficas) return;

        let chart = perStreamChartInstances.get(canvasId);
        if (!chart) {
            let color = colorDeCamara(streamName);
            let c = coloresGraficas();
            chart = new Chart(document.getElementById(canvasId), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Entrada', data: inputSeries, borderColor: color, backgroundColor: color },
                        { label: 'Salida', data: outputSeries, borderColor: color, backgroundColor: color, borderDash: TRAZO_SALIDA },
                        { label: 'Total', data: totalSeries, borderColor: c.texto3, backgroundColor: c.texto3, borderWidth: 1 }
                    ]
                },
                options: opcionesGrafica()
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
        [allStreamThroughputSeries, allStreamInputSeries, allStreamOutputSeries].forEach(mapa => {
            if (!mapa.has(streamName)) mapa.set(streamName, new Array(Math.max(0, labelsLen - 1)).fill(0));
        });

        let sample = valueByName.get(streamName) || { inMbps: 0, outMbps: 0, mbps: 0 };
        let pares = [
            [allStreamThroughputSeries.get(streamName), sample.mbps],
            [allStreamInputSeries.get(streamName), sample.inMbps],
            [allStreamOutputSeries.get(streamName), sample.outMbps]
        ];
        pares.forEach(([serie, valor]) => {
            serie.push(Number(valor.toFixed(3)));
            while (serie.length > labelsLen) serie.shift();
        });
    });
}

/**
 * Actualiza el grafico combinado con los streams mas activos del momento.
 * El color sigue a la cámara (no al puesto en el ranking).
 * @param {string[]} labels - Etiquetas temporales del eje X.
 */
function updateCombinedStreamThroughputChart(labels) {
    if (!streamThroughputChart) return;

    let topStreams = [...allStreamThroughputSeries.entries()]
        .map(([name, series]) => ({ name, latest: series.length > 0 ? series[series.length - 1] : 0 }))
        .sort((a, b) => b.latest - a.latest)
        .slice(0, MAX_STREAM_DATASETS)
        .map(item => item.name)
        .sort();

    streamThroughputChart.data.labels = labels;
    streamThroughputChart.data.datasets = topStreams.map(streamName => {
        let color = colorDeCamara(streamName);
        return {
            label: streamName,
            data: allStreamThroughputSeries.get(streamName),
            borderColor: color,
            backgroundColor: color
        };
    });
    streamThroughputChart.update('none');
}

/**
 * Actualiza todas las visualizaciones del dashboard con un nuevo muestreo.
 * Sin Chart.js se siguen calculando series y pintando las secciones por stream.
 * @param {Array<object>} items - Paths activos devueltos por API.
 */
function updateCharts(items) {
    let nowMs = Date.now();
    let throughput = computeThroughput(items, nowMs);
    let label = new Date(nowMs).toLocaleTimeString('es-ES');

    throughputHistory.push({
        label,
        inMbps: Number(throughput.inMbps.toFixed(3)),
        outMbps: Number(throughput.outMbps.toFixed(3))
    });

    if (throughputHistory.length > MAX_HISTORY_POINTS) {
        throughputHistory.shift();
    }

    let labels = throughputHistory.map(point => point.label);

    if (throughputChart) {
        throughputChart.data.labels = labels;
        throughputChart.data.datasets[0].data = throughputHistory.map(point => point.inMbps);
        throughputChart.data.datasets[1].data = throughputHistory.map(point => point.outMbps);
        throughputChart.update('none');
    }

    updateAllStreamSeries(items, throughput.perStream, labels.length);
    updateCombinedStreamThroughputChart(labels);
    updateStreamBlocks(items, labels);

    if (readersChart) {
        readersChart.data.labels = items.map(path => path.name || 'sin nombre');
        readersChart.data.datasets[0].data = items.map(path => (Array.isArray(path.readers) ? path.readers.length : 0));
        readersChart.data.datasets[0].backgroundColor = items.map(path => colorDeCamara(path.name));
        readersChart.update('none');
    }
}
