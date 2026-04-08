/**
 * DASHBOARD STATS - UI
 * Render de resumen y estados visuales del dashboard.
 */

let REFRESH_INTERVAL_MS = Number(localStorage.getItem('stats_refresh_interval_ms')) || 1500;
let refreshTimer = null;
let throughputChart = null;
let streamThroughputChart = null;
let readersChart = null;
let perStreamChartInstances = new Map();

let previousPathSample = new Map();
let throughputHistory = [];
let allStreamThroughputSeries = new Map();
let allStreamInputSeries = new Map();
let allStreamOutputSeries = new Map();
const MAX_HISTORY_POINTS = 120;
const MAX_STREAM_DATASETS = 8;
const STREAM_COLORS = [
    '#60a5fa', '#4ade80', '#fbbf24', '#f472b6',
    '#22d3ee', '#c084fc', '#fb7185', '#a3e635'
];

/**
 * ELEMENTOS DOM
 */

let streamSectionsContainerEl = document.getElementById('streamSectionsContainer');
let pathsCountEl = document.getElementById('pathsCount');
let lastUpdateEl = document.getElementById('lastUpdate');
let refreshBtn = document.getElementById('refreshBtn');
let autoRefreshEl = document.getElementById('autoRefresh');
let refreshIntervalInputEl = document.getElementById('refreshIntervalInput');
let refreshIntervalLabelEl = document.getElementById('refreshIntervalLabel');

let totalPathsEl = document.getElementById('totalPaths');
let readyPathsEl = document.getElementById('readyPaths');
let onlinePathsEl = document.getElementById('onlinePaths');
let totalReadersEl = document.getElementById('totalReaders');
let totalBytesReceivedEl = document.getElementById('totalBytesReceived');
let totalBytesSentEl = document.getElementById('totalBytesSent');


/**
 * Actualiza el resumen superior del dashboard.
 * @param {Array<object>} items - Paths activos.
 */
function renderizarResumen(items) {
    let totalPaths = items.length;
    let readyPaths = items.filter(path => path.ready).length;
    let onlinePaths = items.filter(path => path.online).length;
    let totalReaders = items.reduce((sum, path) => sum + ((path.readers && path.readers.length) || 0), 0);
    let totalBytesReceived = items.reduce((sum, path) => sum + (path.bytesReceived || 0), 0);
    let totalBytesSent = items.reduce((sum, path) => sum + (path.bytesSent || 0), 0);

    totalPathsEl.textContent = String(totalPaths);
    readyPathsEl.textContent = String(readyPaths);
    onlinePathsEl.textContent = String(onlinePaths);
    totalReadersEl.textContent = String(totalReaders);
    totalBytesReceivedEl.textContent = formatBytes(totalBytesReceived);
    totalBytesSentEl.textContent = formatBytes(totalBytesSent);

    pathsCountEl.textContent = `${totalPaths} streams`;
}

/**
 * Muestra un error visual en la zona de streams.
 * @param {Error} error - Error capturado durante la carga.
 */
function renderizarErrorStats(error) {
    if (streamSectionsContainerEl) {
        streamSectionsContainerEl.innerHTML = `<div class="error">No se pudieron cargar las estadisticas: ${escapeHtml(error.message)}</div>`;
    }
    lastUpdateEl.textContent = 'Error al actualizar';
}




// UI CHARTS

// UI
/**
 * Genera un id estable de canvas por nombre de stream.
 * @param {string} streamName - Nombre del stream.
 * @returns {string}
 */
function obtenerIdCanvasStream(streamName) {
    let hash = 0;
    for (let i = 0; i < streamName.length; i += 1) {
        hash = ((hash << 5) - hash) + streamName.charCodeAt(i);
        hash |= 0;
    }

    let safe = streamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `stream-chart-${safe || 'path'}-${Math.abs(hash)}`;
}

/**
 * Genera un id estable para la section del stream.
 * @param {string} streamName - Nombre del stream.
 * @returns {string}
 */
function obtenerIdBloqueStream(streamName) {
    return `block-${obtenerIdCanvasStream(streamName)}`;
}

/**
 * Actualiza texto de un elemento por id si existe en el DOM.
 * @param {string} id - Id del elemento.
 * @param {string} value - Texto a mostrar.
 */
function ponerTextoPorId(id, value) {
    let el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

