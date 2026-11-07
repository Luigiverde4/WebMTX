/**
 * MINIATURAS DE GRABACIONES (en el navegador)
 * Pide 1 s de grabación a /api/playback/get, saca un fotograma con un <video>
 * fuera del DOM y lo guarda como JPEG en IndexedDB para la próxima vez. Mismo
 * origen que la página, así que el canvas no queda bloqueado.
 *
 *   pedirMiniatura('cam1|2026-11-06T19:55:34Z', '/api/playback/get?…') → Promise<dataURL|null>
 */

const MINIATURAS = {
    ancho: 320,
    alto: 180,
    maxSimultaneas: 2,      // No saturar MediaMTX ni la red con decenas a la vez
    tiempoMaxMs: 8000,
    activas: 0,
    cola: [],
    bd: undefined           // undefined = sin abrir; null = no disponible
};

/** Base de datos de miniaturas, o null si el navegador no la deja usar. */
function abrirBdMiniaturas() {
    if (MINIATURAS.bd !== undefined) return Promise.resolve(MINIATURAS.bd);
    return new Promise(resolve => {
        try {
            let peticion = indexedDB.open('webmtx-miniaturas', 1);
            peticion.onupgradeneeded = () => peticion.result.createObjectStore('miniaturas');
            peticion.onsuccess = () => { MINIATURAS.bd = peticion.result; resolve(MINIATURAS.bd); };
            peticion.onerror = () => { MINIATURAS.bd = null; resolve(null); };
        } catch {
            MINIATURAS.bd = null;
            resolve(null);
        }
    });
}

async function leerMiniaturaGuardada(clave) {
    let bd = await abrirBdMiniaturas();
    if (!bd) return null;
    return new Promise(resolve => {
        try {
            let peticion = bd.transaction('miniaturas').objectStore('miniaturas').get(clave);
            peticion.onsuccess = () => resolve(peticion.result || null);
            peticion.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function guardarMiniatura(clave, dataUrl) {
    let bd = await abrirBdMiniaturas();
    if (!bd) return;
    try {
        bd.transaction('miniaturas', 'readwrite').objectStore('miniaturas').put(dataUrl, clave);
    } catch {
        // Sin espacio o bloqueado: se regenerará la próxima vez
    }
}

/** Olvida una miniatura (al borrar su grabación). */
async function borrarMiniaturaGuardada(clave) {
    let bd = await abrirBdMiniaturas();
    if (!bd) return;
    try {
        bd.transaction('miniaturas', 'readwrite').objectStore('miniaturas').delete(clave);
    } catch {
        // Nada que hacer: como mucho queda una entrada huérfana
    }
}

/**
 * Carga el vídeo y dibuja su primer fotograma (encajado, sin recortar).
 * @param {string} url
 * @returns {Promise<string>} dataURL JPEG
 */
function capturarFotograma(url) {
    return new Promise((resolve, reject) => {
        let video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        let soltar = () => {
            clearTimeout(limite);
            video.removeAttribute('src');
            video.load(); // corta la descarga (el proxy cierra la petición a MediaMTX)
        };
        let limite = setTimeout(() => { soltar(); reject(new Error('tiempo agotado')); }, MINIATURAS.tiempoMaxMs);

        video.addEventListener('loadeddata', () => {
            try {
                let lienzo = document.createElement('canvas');
                lienzo.width = MINIATURAS.ancho;
                lienzo.height = MINIATURAS.alto;
                let ctx = lienzo.getContext('2d');
                let escala = Math.min(lienzo.width / video.videoWidth, lienzo.height / video.videoHeight);
                let w = video.videoWidth * escala;
                let h = video.videoHeight * escala;
                ctx.drawImage(video, (lienzo.width - w) / 2, (lienzo.height - h) / 2, w, h);
                let dataUrl = lienzo.toDataURL('image/jpeg', 0.7);
                soltar();
                resolve(dataUrl);
            } catch (error) {
                soltar();
                reject(error);
            }
        }, { once: true });
        video.addEventListener('error', () => { soltar(); reject(new Error('no se pudo decodificar')); }, { once: true });

        video.src = url;
    });
}

function siguienteMiniatura() {
    while (MINIATURAS.activas < MINIATURAS.maxSimultaneas && MINIATURAS.cola.length) {
        let { url, resolve } = MINIATURAS.cola.shift();
        MINIATURAS.activas++;
        capturarFotograma(url)
            .then(resolve, () => resolve(null))
            .finally(() => { MINIATURAS.activas--; siguienteMiniatura(); });
    }
}

/**
 * Miniatura de una grabación: de la caché o generada (en cola, como mucho
 * MINIATURAS.maxSimultaneas a la vez).
 * @param {string} clave - Identifica la toma (p. ej. "cam1|<inicio ISO>").
 * @param {string} url - Tramo corto de /api/playback/get del que sacar el fotograma.
 * @returns {Promise<string|null>} null si no se pudo (códec no reproducible…).
 */
async function pedirMiniatura(clave, url) {
    let guardada = await leerMiniaturaGuardada(clave);
    if (guardada) return guardada;
    let dataUrl = await new Promise(resolve => {
        MINIATURAS.cola.push({ url, resolve });
        siguienteMiniatura();
    });
    if (dataUrl) guardarMiniatura(clave, dataUrl);
    return dataUrl;
}
