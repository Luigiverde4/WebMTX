/**
 * GRABACIONES (sin DOM)
 * Consulta de lo grabado en MediaMTX y URLs de reproducción. La usan
 * Repeticiones (playback.js) y Archivo (archivo.js).
 *
 * /api/playback/list ya une los segmentos contiguos de 10 min: cada elemento
 * es una toma completa (de que la cámara empieza a emitir a que para).
 */

/**
 * Convierte la URL absoluta que entrega MediaMTX en una URL del proxy local.
 * @param {string} segmentUrl - URL devuelta por /api/playback/list.
 * @returns {string|null}
 */
function construirUrlProxyPlayback(segmentUrl) {
    try {
        let parsed = new URL(segmentUrl);
        return `/api/playback${parsed.pathname}${parsed.search}`;
    } catch {
        return null;
    }
}

/**
 * URL del proxy de playback para ver (fMP4) o descargar (mp4) un tramo. El
 * vídeo servido empieza en `inicio` (su t=0): no hay que saltar dentro de él.
 * Para empezar justo al inicio de una toma hay que pasar su ISO exacto
 * (startISO, con microsegundos): un Date redondea a milisegundos, cae un
 * instante antes de la grabación y MediaMTX responde 404.
 * @param {string} path - Cámara (path de MediaMTX).
 * @param {Date|string} inicio - Instante real del primer fotograma (Date o ISO).
 * @param {number} duracionS - Segundos como máximo.
 * @param {'fmp4'|'mp4'} [formato]
 * @returns {string}
 */
function urlPlayback(path, inicio, duracionS, formato) {
    let iso = typeof inicio === 'string' ? inicio : inicio.toISOString();
    let url = `/api/playback/get?duration=${encodeURIComponent(Math.max(1, duracionS))}`
        + `&path=${encodeURIComponent(path)}`
        + `&start=${encodeURIComponent(iso)}`;
    return formato === 'mp4' ? `${url}&format=mp4` : url;
}

/**
 * Tomas grabadas de un stream.
 * @param {string} stream
 * @returns {Promise<Array<{stream: string, start: Date, duration: number, startISO: string, url: string}>>}
 */
async function consultarSegmentos(stream) {
    let response = await fetch(`/api/playback/list?path=${encodeURIComponent(stream)}`);
    if (!response.ok) return [];
    let segments = await response.json();
    return (Array.isArray(segments) ? segments : []).map(segment => ({
        stream,
        start: new Date(segment.start),
        duration: segment.duration,
        startISO: segment.start,
        url: segment.url
    }));
}

/** Ordena de más reciente a más antigua (in situ). */
function ordenarGrabaciones(grabaciones) {
    return grabaciones.sort((a, b) => b.start - a.start);
}

/**
 * Tomas de todos los paths grabados, de más reciente a más antigua.
 * @returns {Promise<Array>}
 */
async function consultarTodasLasGrabaciones() {
    let pathsResponse = await fetch('/api/mediamtx/v3/recordings/list');
    if (!pathsResponse.ok) {
        throw new Error(`HTTP ${pathsResponse.status}: ${pathsResponse.statusText}`);
    }
    let pathsData = await pathsResponse.json();
    let nombres = (pathsData.items || []).map(item => item.name);
    let listas = await Promise.all(nombres.map(consultarSegmentos));
    return ordenarGrabaciones(listas.flat());
}

/**
 * Paths que están emitiendo ahora mismo (ready en la API v3).
 * @returns {Promise<Set<string>>}
 */
async function pathsEnDirecto() {
    let response = await fetch('/api/mediamtx/v3/paths/list');
    if (!response.ok) return new Set();
    let datos = await response.json();
    return new Set((datos.items || []).filter(p => p.ready).map(p => p.name));
}
