/**
 * SALIDA DE REPETICIONES PARA OBS (display.html)
 * Enviar, quitar y escuchar qué hay en la salida. El servidor guarda el estado
 * en memoria y lo difunde por SSE (/api/replay/*). Lo usan Repeticiones y Archivo.
 */

/**
 * Pone una repetición en la salida de OBS.
 * @param {{url: string, seekOffset?: number, label?: string}} seleccion - url de /api/playback/get?…
 * @throws {Error} Con el mensaje del servidor si la rechaza.
 */
async function enviarRepeticion(seleccion) {
    let response = await fetch('/api/replay/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seekOffset: 0, ...seleccion })
    });
    if (!response.ok) {
        let detalle = await response.json().catch(() => ({}));
        throw new Error(detalle.error || `HTTP ${response.status}`);
    }
}

/** Vacía la salida de OBS. */
async function quitarRepeticion() {
    let response = await fetch('/api/replay/stop', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/** ¿Hay algo en la salida según el estado recibido por SSE? */
function haySalidaObs(estado) {
    return Boolean(estado && estado.cmd === 'play');
}

/** Tally de la página = lo que hay en la salida de OBS. */
function pintarTallySalidaObs(estado) {
    if (haySalidaObs(estado)) {
        // El cronómetro cuenta cuánto lleva en directo esta repetición
        ponerTally('directo', { estado: 'En OBS', detalle: estado.label || 'Repetición', cronometro: true });
    } else {
        ponerTally('inactivo', { estado: 'OBS vacío', detalle: 'Nada en la salida de repeticiones' });
    }
}

/**
 * Escucha el mismo canal SSE que usan los displays.
 * @param {(estado: object|null) => void} alCambiar
 * @param {() => void} [alPerderConexion]
 */
function suscribirSalidaObs(alCambiar, alPerderConexion) {
    if (typeof EventSource === 'undefined') return;
    let source = new EventSource('/api/replay/events');
    source.onmessage = (event) => {
        try {
            alCambiar(JSON.parse(event.data));
        } catch (error) {
            console.warn('Mensaje SSE no válido:', error);
        }
    };
    source.onerror = () => { if (alPerderConexion) alPerderConexion(); };
}
