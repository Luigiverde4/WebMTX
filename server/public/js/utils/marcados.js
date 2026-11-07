/**
 * MOMENTOS MARCADOS (almacenamiento, sin DOM)
 * Instantes que el operador guarda para lanzarlos luego como repetición. Se
 * guardan en este navegador (localStorage): son notas de trabajo, no van al
 * servidor. Los marca Repeticiones (botón Marcar) y Archivo (visor), y los
 * lista Repeticiones. Cada momento es solo cámara + instante:
 *   { id: número, stream: 'cam1', iso: '2026-11-07T10:31:30.000Z', nota: '' }
 */

const CLAVE_MARCADOS = 'webmtx.playback.marcados';

// Cuántos momentos se conservan (los más recientes)
const MAX_MARCADOS = 50;

/** Lista guardada (vacía si no hay o el almacenamiento no está disponible). */
function leerMarcadosGuardados() {
    try {
        let guardado = JSON.parse(localStorage.getItem(CLAVE_MARCADOS));
        return Array.isArray(guardado) ? guardado : [];
    } catch {
        return [];
    }
}

/** Persiste la lista (recortada a los MAX_MARCADOS más recientes). */
function guardarMarcados(lista) {
    try {
        localStorage.setItem(CLAVE_MARCADOS, JSON.stringify(lista.slice(0, MAX_MARCADOS)));
        return true;
    } catch (error) {
        console.warn('No se pudieron guardar los momentos marcados:', error);
        return false;
    }
}

/**
 * Añade un momento al principio de la lista guardada.
 * @param {string} stream
 * @param {Date} instante
 * @returns {boolean} false si no se pudo guardar
 */
function anadirMarcado(stream, instante) {
    let lista = leerMarcadosGuardados();
    lista.unshift({ id: Date.now(), stream, iso: instante.toISOString(), nota: '' });
    return guardarMarcados(lista);
}
