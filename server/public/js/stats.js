/**
 * DASHBOARD STATS - BOOTSTRAP Y REFERENCIAS DOM
 * Orquesta la inicializacion y el ciclo de refresco automatico.
 */

/**
 * Datos iniciales para gráficos y refresco.
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



// REFRESCO AUTOMATICO
/**
 * Inicia el refresco periodico automatico.
 */
function startAutoRefresh() {
    stopAutoRefresh();
    refreshTimer = setInterval(loadStats, REFRESH_INTERVAL_MS);
}

/**
 * Detiene el refresco periodico automatico.
 */
function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Normaliza y guarda el intervalo de refresco en milisegundos.
 * @param {number} value - Intervalo solicitado por el usuario.
 */
function setRefreshInterval(value) {
    let nextValue = Number(value);

    if (!Number.isFinite(nextValue)) {
        nextValue = 1500;
    }

    nextValue = Math.max(250, Math.min(60000, Math.round(nextValue)));
    REFRESH_INTERVAL_MS = nextValue;
    localStorage.setItem('stats_refresh_interval_ms', String(nextValue));

    if (refreshIntervalInputEl && refreshIntervalInputEl.value !== String(nextValue)) {
        refreshIntervalInputEl.value = String(nextValue);
    }

    if (refreshIntervalLabelEl) {
        refreshIntervalLabelEl.textContent = `(${(nextValue / 1000).toFixed(nextValue % 1000 === 0 ? 0 : 2).replace(/\.0+$/, '')}s)`;
    }

    if (autoRefreshEl.checked) {
        startAutoRefresh();
    }
}


/**
 * DASHBOARD STATS - CARGA DE DATOS
 * Peticiones al backend para obtener las estadisticas.
 */

/**
 * Solicita estadisticas al backend y refresca toda la UI.
 */
async function loadStats() {
    try {
        let response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        let data = await response.json();
        let items = Array.isArray(data.items) ? data.items : [];

        renderSummary(items);
        updateCharts(items);
        lastUpdateEl.textContent = `Ultima actualizacion: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error cargando estadisticas:', error);
        renderStatsError(error);
    }
}


// EVENTOS UI
refreshBtn.addEventListener('click', loadStats);
autoRefreshEl.addEventListener('change', () => {
    if (autoRefreshEl.checked) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
});

refreshIntervalInputEl.addEventListener('change', () => {
    setRefreshInterval(refreshIntervalInputEl.value);
});

refreshIntervalInputEl.addEventListener('blur', () => {
    setRefreshInterval(refreshIntervalInputEl.value);
});

// CICLO DE VIDA
document.addEventListener('DOMContentLoaded', async () => {
    refreshIntervalInputEl.value = String(REFRESH_INTERVAL_MS);
    if (refreshIntervalLabelEl) {
        refreshIntervalLabelEl.textContent = `(${(REFRESH_INTERVAL_MS / 1000).toFixed(REFRESH_INTERVAL_MS % 1000 === 0 ? 0 : 2).replace(/\.0+$/, '')}s)`;
    }
    initCharts();
    await loadStats();
    if (autoRefreshEl.checked) {
        startAutoRefresh();
    }
});
