/**
 * UTILIDADES DEL REPRODUCTOR DE GRABACIONES
 * Formateos y helpers específicos de playback.
 */

/**
 * Formatea una fecha completa en formato local.
 * @param {Date} date - Fecha a formatear.
 */
function formatDate(date) {
    let day = String(date.getDate()).padStart(2, '0');
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let year = date.getFullYear();
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formatea únicamente la hora de una fecha.
 * @param {Date} date - Fecha a formatear.
 */
function formatTimeOnly(date) {
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Convierte una duración en segundos a una etiqueta legible.
 * @param {number} seconds - Duración en segundos.
 */
function formatDuration(seconds) {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }

    return `${secs}s`;
}

/**
 * Formatea un tiempo en mm:ss o hh:mm:ss.
 * @param {number} seconds - Tiempo en segundos.
 */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';

    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}