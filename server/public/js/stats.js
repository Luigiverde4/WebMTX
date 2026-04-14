/**
 * DASHBOARD STATS
 * Inicio y polling de datos
 */


// REFRESCO AUTOMATICO
/**
 * Inicia el refresco periodico automatico.
 */
function empezarAutoRefresh() {
    pararAutoRefresh();
    refreshTimer = setInterval(loadStats, REFRESH_INTERVAL_MS);
}

/**
 * Detiene el refresco periodico automatico.
 */
function pararAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Normaliza y guarda el intervalo de refresco en milisegundos.
 * @param {number} value - Intervalo solicitado por el usuario.
 */
function ponerIntervaloRefresco(value) {
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
        empezarAutoRefresh();
    }
}


// CARGA DE DATOS
/**
 * Solicita estadisticas al backend y refresca toda la UI.
 */
async function loadStats() {
    try {
        let response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) {
            throw new Error(`HTTPS ${response.status}: ${response.statusText}`);
        }

        let data = await response.json();
        let items = Array.isArray(data.items) ? data.items : [];

        renderizarResumen(items);
        updateCharts(items);
        lastUpdateEl.textContent = `Ultima actualizacion: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Error cargando estadisticas:', error);
        renderizarErrorStats(error);
    }
}


// EVENTOS UI
refreshBtn.addEventListener('click', loadStats);
autoRefreshEl.addEventListener('change', () => {
    if (autoRefreshEl.checked) {
        empezarAutoRefresh();
    } else {
        pararAutoRefresh();
    }
});

refreshIntervalInputEl.addEventListener('change', () => {
    ponerIntervaloRefresco(refreshIntervalInputEl.value);
});

refreshIntervalInputEl.addEventListener('blur', () => {
    ponerIntervaloRefresco(refreshIntervalInputEl.value);
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
        empezarAutoRefresh();
    }
});
