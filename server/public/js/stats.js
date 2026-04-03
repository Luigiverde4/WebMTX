/**
 * DASHBOARD STATS - BOOTSTRAP Y REFERENCIAS DOM
 * Orquesta la inicializacion y el ciclo de refresco automatico.
 */

/**
 * Dattos iniciales para gráficos y refresco.
 */
let REFRESH_INTERVAL_MS = 1500;
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

// CICLO DE VIDA
document.addEventListener('DOMContentLoaded', async () => {
    initCharts();
    await loadStats();
    if (autoRefreshEl.checked) {
        startAutoRefresh();
    }
});
