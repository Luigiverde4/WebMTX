/**
 * CONTROL DE SALIDA A OBS (Repeticiones)
 * Envía al display de OBS la repetición que se está previsualizando
 * (`ultimaSeleccion` de playback.js) o lo limpia. El envío y la escucha están
 * en js/utils/salida-obs.js; el tally de la página refleja lo que hay en la salida.
 */

/**
 * Envía a OBS la última repetición reproducida en la previsualización.
 */
async function enviarAlDisplay() {
    if (!ultimaSeleccion) return; // El botón está desactivado hasta reproducir algo
    try {
        await enviarRepeticion(ultimaSeleccion);
    } catch (error) {
        avisarError(`No se pudo enviar a OBS: ${error.message}`);
    }
}

/**
 * Limpia la salida de OBS (deja de mostrar la repetición).
 */
async function quitarDelDisplay() {
    try {
        await quitarRepeticion();
    } catch (error) {
        avisarError(`No se pudo vaciar la salida de OBS: ${error.message}`);
    }
}

// Refleja en el panel y en el tally qué hay actualmente en OBS
suscribirSalidaObs(estado => {
    let obsStatusEl = document.getElementById('obsStatus');
    let hay = haySalidaObs(estado);
    // "Quitar" solo tiene sentido con algo en la salida
    document.getElementById('quitarObsBtn').disabled = !hay;
    obsStatusEl.classList.toggle('activo', hay);
    if (hay) {
        let enviado = estado.ts ? formatTimeOnly(new Date(estado.ts)) : '';
        obsStatusEl.textContent = `En OBS: ${estado.label || 'repetición'}${enviado ? `, enviada a las ${enviado}` : ''}`;
    } else {
        obsStatusEl.textContent = 'En OBS: nada';
    }
    pintarTallySalidaObs(estado);
}, () => {
    // Sin conexión no se sabe qué hay en OBS: se deja Quitar disponible
    document.getElementById('quitarObsBtn').disabled = false;
    document.getElementById('obsStatus').textContent = 'Sin conexión con el servidor: reintentando…';
});
