/**
 * WATCHDOG COMPARTIDO
 * Vigila una métrica de bytes y dispara una acción si se estanca.
 */

/**
 * Crea un watchdog de tráfico basado en crecimiento de bytes.
 * @param {Object} options - Configuración del watchdog.
 * @param {number} options.intervalMs - Intervalo de muestreo.
 * @param {number} options.maxStalledSamples - Número de muestras sin crecimiento permitidas.
 * @param {Function} options.sample - Función async que devuelve { monitorable, totalBytes }.
 * @param {Function} [options.onStalled] - Callback cuando se detecta estancamiento.
 * @param {Function} [options.onError] - Callback para errores de muestreo.
 * @returns {{ start: Function, stop: Function }}
 */
function createTrafficWatchdog(options) {
    let timer = null;
    let lastTotalBytes = 0;
    let stalledSamples = 0;
    let running = false;

    async function sampleOnce() {
        if (!running) return;

        try {
            let measurement = await options.sample();
            if (!measurement || measurement.monitorable === false) {
                stalledSamples = 0;
                lastTotalBytes = 0;
                return;
            }

            let totalBytes = typeof measurement.totalBytes === 'number' ? measurement.totalBytes : 0;

            if (totalBytes > lastTotalBytes) {
                stalledSamples = 0;
            } else {
                stalledSamples += 1;

                if (stalledSamples >= options.maxStalledSamples) {
                    stop();
                    if (typeof options.onStalled === 'function') {
                        options.onStalled({ totalBytes, lastTotalBytes, stalledSamples });
                    }
                    return;
                }
            }

            lastTotalBytes = totalBytes;
        } catch (error) {
            if (typeof options.onError === 'function') {
                options.onError(error);
            }
        }
    }

    function start() {
        stop();
        running = true;
        lastTotalBytes = 0;
        stalledSamples = 0;
        sampleOnce();
        timer = setInterval(sampleOnce, options.intervalMs);
    }

    function stop() {
        running = false;

        if (timer) {
            clearInterval(timer);
            timer = null;
        }

        lastTotalBytes = 0;
        stalledSamples = 0;
    }

    return { start, stop };
}