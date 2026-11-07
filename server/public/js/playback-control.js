/**
 * CONTROL DE SALIDA A OBS
 * Envía al display de OBS (display.html, vía servidor) la repetición que se
 * está previsualizando, o lo limpia. Reutiliza `ultimaSeleccion` de playback.js.
 * El tally de la página refleja lo que hay en la salida.
 */

/**
 * Envía a OBS la última repetición reproducida en la previsualización.
 */
async function enviarAlDisplay() {
    if (!ultimaSeleccion) {
        setEstado('Reproduce algo primero: se envía lo que estés previsualizando', 'error');
        return;
    }

    try {
        let response = await fetch('/api/replay/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ultimaSeleccion)
        });
        if (!response.ok) {
            let detalle = await response.json().catch(() => ({}));
            throw new Error(detalle.error || `HTTP ${response.status}`);
        }
        setEstado(`Enviado a OBS: ${ultimaSeleccion.label}`, 'ok');
    } catch (error) {
        setEstado(`No se pudo enviar a OBS: ${error.message}`, 'error');
        mostrarAviso(`No se pudo enviar a OBS: ${error.message}`, 'error');
    }
}

/**
 * Limpia la salida de OBS (deja de mostrar la repetición).
 */
async function quitarDelDisplay() {
    try {
        let response = await fetch('/api/replay/stop', { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setEstado('Salida de OBS vaciada', 'ok');
    } catch (error) {
        setEstado(`No se pudo vaciar la salida de OBS: ${error.message}`, 'error');
    }
}

/**
 * Refleja en el panel y en el tally qué hay actualmente en OBS, escuchando el
 * mismo canal SSE que usan los displays.
 */
(function suscribirEstadoDisplay() {
    let obsStatusEl = document.getElementById('obsStatus');
    if (!obsStatusEl || typeof EventSource === 'undefined') return;

    let pintar = (estado) => {
        if (!estado || estado.cmd !== 'play') {
            obsStatusEl.textContent = 'En OBS: nada';
            obsStatusEl.classList.remove('activo');
            ponerTally('inactivo', { estado: 'OBS vacío', detalle: 'Nada en la salida de repeticiones' });
        } else {
            let enviado = estado.ts ? formatTimeOnly(new Date(estado.ts)) : '';
            obsStatusEl.textContent = `En OBS: ${estado.label || 'repetición'}${enviado ? `, enviada a las ${enviado}` : ''}`;
            obsStatusEl.classList.add('activo');
            // El cronómetro cuenta cuánto lleva en directo esta repetición
            ponerTally('directo', { estado: 'En OBS', detalle: estado.label || 'Repetición', cronometro: true });
        }
    };

    let source = new EventSource('/api/replay/events');
    source.onmessage = (event) => {
        try {
            pintar(JSON.parse(event.data));
        } catch (error) {
            console.warn('Mensaje SSE no válido:', error);
        }
    };
    source.onerror = () => {
        obsStatusEl.textContent = 'Sin conexión con el servidor: reintentando…';
    };
})();
