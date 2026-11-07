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
 * Firma de una lista de grabaciones: identifica qué segmentos hay y cuánto dura
 * cada uno. Comparar firmas dice si merece la pena repintar los desplegables.
 * @param {Array} grabaciones - Lista de grabaciones.
 * @returns {string}
 */
function firmaGrabaciones(grabaciones) {
    return grabaciones
        .map(r => `${r.stream}|${r.startISO}|${Math.floor(r.duration)}`)
        .join(',');
}

/**
 * Indica si algún <select> de la página está desplegado. Repintar en ese momento
 * le cambiaría las opciones al usuario justo mientras elige.
 * @returns {boolean}
 */
function hayDesplegableAbierto() {
    let activo = document.activeElement;
    return !!activo && activo.tagName === 'SELECT';
}


/**
 * ESCALA DE LA LÍNEA TEMPORAL (logarítmica por tramos)
 *
 * En un directo casi siempre se pincha algo reciente, pero una grabación de
 * varias horas aplasta esos minutos en unos pocos píxeles: con una escala lineal
 * y 1 h grabada, "hace 1 minuto" cae en el 98,3 % del recorrido, imposible de
 * cazar con el ratón.
 *
 * Por eso la barra mapea "hace cuánto" (el AHORA a la derecha) con un ANCLA fijo:
 * la mitad derecha cubre siempre los últimos TIMELINE_ANCLA_S segundos, y la
 * izquierda todo lo anterior, por larga que sea la grabación. Dentro de cada
 * mitad la escala es logarítmica, así que lo más reciente sigue teniendo más
 * espacio que lo viejo. El ancla no depende de la duración: la zona de trabajo
 * ocupa lo mismo con 10 minutos grabados que con 5 horas.
 */

// Resolución de la barra: posiciones enteras de 0 (lo más antiguo) a 1000 (ahora).
const TIMELINE_PASOS = 1000;

// Antigüedad mínima representable (extremo derecho). No baja de aquí a propósito:
// el borde vivo no es reproducible (ver MARGEN_FIN_VIVO_S), así que dedicarle
// recorrido solo robaría espacio a la franja útil de segundos y minutos.
const TIMELINE_ANTIGUEDAD_MIN_S = 5;

// Los últimos 5 minutos ocupan la mitad derecha de la barra.
const TIMELINE_ANCLA_S = 300;
const TIMELINE_ANCLA_FRACCION = 0.5;

/**
 * Convierte una antigüedad ("hace N segundos") en posición de la barra.
 * @param {number} antiguedadS - Segundos transcurridos desde ese momento.
 * @param {number} maxAntiguedadS - Antigüedad del punto más viejo (extremo izquierdo).
 * @returns {number} Posición entera en [0, TIMELINE_PASOS].
 */
function antiguedadAPosicion(antiguedadS, maxAntiguedadS) {
    let min = TIMELINE_ANTIGUEDAD_MIN_S;
    let ancla = TIMELINE_ANCLA_S;
    let max = Math.max(maxAntiguedadS, ancla + 1);
    let valor = Math.min(Math.max(antiguedadS, min), max);

    let fraccion;
    if (valor <= ancla) {
        // Tramo reciente (mitad derecha): log entre el ahora y el ancla.
        let t = Math.log(valor / min) / Math.log(ancla / min);
        fraccion = 1 - t * TIMELINE_ANCLA_FRACCION;
    } else {
        // Tramo antiguo (mitad izquierda): log entre el ancla y lo más viejo.
        let t = Math.log(valor / ancla) / Math.log(max / ancla);
        fraccion = TIMELINE_ANCLA_FRACCION * (1 - t);
    }

    return Math.round(fraccion * TIMELINE_PASOS);
}

/**
 * Convierte una posición de la barra en antigüedad ("hace N segundos").
 * Inversa exacta de antiguedadAPosicion().
 * @param {number} posicion - Posición entera en [0, TIMELINE_PASOS].
 * @param {number} maxAntiguedadS - Antigüedad del punto más viejo (extremo izquierdo).
 * @returns {number} Segundos transcurridos desde el momento apuntado.
 */
function posicionAAntiguedad(posicion, maxAntiguedadS) {
    let min = TIMELINE_ANTIGUEDAD_MIN_S;
    let ancla = TIMELINE_ANCLA_S;
    let max = Math.max(maxAntiguedadS, ancla + 1);
    let fraccion = Math.min(Math.max(posicion / TIMELINE_PASOS, 0), 1);

    if (fraccion >= TIMELINE_ANCLA_FRACCION) {
        // Mitad derecha: del ancla (en la mitad) al ahora (a la derecha).
        let t = (1 - fraccion) / TIMELINE_ANCLA_FRACCION;
        return min * Math.pow(ancla / min, t);
    }

    // Mitad izquierda: del punto más viejo (a la izquierda) al ancla (en la mitad).
    let t = 1 - (fraccion / TIMELINE_ANCLA_FRACCION);
    return ancla * Math.pow(max / ancla, t);
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