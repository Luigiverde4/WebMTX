/**
 * DISPLAY DE REPETICIONES (fuente de OBS)
 * No decide nada: se suscribe al estado del servidor (SSE) y reproduce la
 * repetición que el control (playback.html) haya fijado. Se pone una sola vez.
 * Dentro de OBS solo se ve el vídeo (o negro / transparente si no hay nada).
 */

let video = document.getElementById('video');
let idle = document.getElementById('idle');
let mutedBadge = document.getElementById('mutedBadge');

const parametros = new URLSearchParams(window.location.search);
// En OBS (window.obsstudio) no se muestra ningún aviso salvo con ?debug=1
if (!window.obsstudio || parametros.get('debug') === '1') document.documentElement.classList.add('depuracion');
if (parametros.get('fondo') === 'transparente') document.documentElement.classList.add('transparente');

// Último id aplicado: evita reiniciar el vídeo si el SSE reenvía el mismo estado
// (p. ej. al reconectar), pero permite re-disparar cuando el id cambia.
let ultimoId = -1;

// Si el navegador bloquea el autoplay con sonido (no hubo gesto de usuario),
// recordamos arrancar en silencio para no fallar en cada repetición.
let sonidoBloqueado = false;

// CONTINUACIÓN DE LA REPETICIÓN
// El playback server corta en el borde vivo: al terminar un tramo se pide el
// siguiente desde donde acabó, así que la repetición no se detiene.
const MARGEN_FIN_VIVO_S = 4;
const REINTENTO_CONTINUACION_MS = 1000;

let sesionReproduccion = 0;   // Sube en cada repetición nueva: descarta tramos viejos
let finDelTramo = null;       // Instante real donde acaba lo que se está viendo
let inicioTramo = null;       // Instante real del segundo 0 del vídeo cargado
let streamEnCurso = null;

/**
 * Extrae stream e instante de inicio de la URL de playback.
 * @param {string} url
 * @returns {{stream: string, inicio: Date}|null}
 */
function datosDeUrl(url) {
    try {
        let params = new URL(url, location.origin).searchParams;
        let stream = params.get('path');
        let start = params.get('start');
        if (!stream || !start) return null;

        return { stream: stream, inicio: new Date(start) };
    } catch {
        return null;
    }
}

function mostrarEspera(visible) {
    idle.hidden = !visible;
    video.classList.toggle('reproduciendo', !visible);
}

/**
 * Reproduce la repetición indicada por el estado.
 * @param {Object} estado - { url, seekOffset }.
 */
function reproducir(estado) {
    mostrarEspera(false);

    // Repetición nueva: invalida los tramos pendientes de la anterior.
    sesionReproduccion++;
    finDelTramo = null;

    let datos = datosDeUrl(estado.url);
    streamEnCurso = datos ? datos.stream : null;

    video.pause();
    video.removeAttribute('src');
    video.load();

    video.src = estado.url;
    video.muted = sonidoBloqueado; // Arrancar mudo solo si ya sabemos que el sonido está vetado
    video.load();

    // El segundo 0 del vídeo servido es el 'start' de la URL
    inicioTramo = datos ? datos.inicio : null;

    if (estado.seekOffset > 0) {
        const onLoadedMetadata = () => {
            try {
                video.currentTime = estado.seekOffset;
            } catch (error) {
                console.warn('No se pudo aplicar seek inicial:', error);
            }
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata);
    }

    intentarReproducir();
}

/**
 * Continúa la repetición pidiendo el tramo siguiente.
 * @param {number} sesion - Sesión que pidió la continuación (descarta las viejas).
 */
function continuarRepeticion(sesion) {
    if (sesion !== sesionReproduccion) return;
    if (!finDelTramo || !streamEnCurso) return;

    let disponible = (Date.now() - MARGEN_FIN_VIVO_S * 1000 - finDelTramo.getTime()) / 1000;

    if (disponible < 1) {
        // La repetición ha alcanzado el directo: esperar a que se grabe más.
        setTimeout(() => continuarRepeticion(sesion), REINTENTO_CONTINUACION_MS);
        return;
    }

    let inicio = finDelTramo;
    inicioTramo = inicio;
    finDelTramo = null;
    video.src = `/api/playback/get?duration=${encodeURIComponent(disponible)}`
        + `&path=${encodeURIComponent(streamEnCurso)}`
        + `&start=${encodeURIComponent(inicio.toISOString())}`;
    video.load();

    intentarReproducir();
}

/**
 * Lanza play() tolerando el bloqueo de autoplay: si el navegador rechaza el
 * sonido, reintenta en silencio. Ignora AbortError (cambio de repetición).
 */
function intentarReproducir() {
    let promesa = video.play();
    if (!promesa || !promesa.catch) return;

    promesa.catch(error => {
        if (error.name === 'AbortError') return;

        if (error.name === 'NotAllowedError' && !video.muted) {
            sonidoBloqueado = true;
            video.muted = true;
            video.play().catch(err => {
                if (err.name !== 'AbortError') console.warn('No se pudo reproducir:', err);
            });
        } else {
            console.warn('No se pudo iniciar la reproducción:', error);
        }
    });
}

/**
 * Detiene y vacía el display.
 */
function detener() {
    sesionReproduccion++;
    finDelTramo = null;
    streamEnCurso = null;

    video.pause();
    video.removeAttribute('src');
    video.load();
    mostrarEspera(true);
    actualizarBadgeMute();
}

// Al acabarse un tramo no se para: se pide el siguiente y se sigue. El fin se
// calcula al terminar: el fMP4 llega en streaming y video.duration crece
// mientras se descarga, así que antes de 'ended' no es la duración real.
video.addEventListener('ended', () => {
    if (inicioTramo && isFinite(video.duration)) {
        finDelTramo = new Date(inicioTramo.getTime() + video.duration * 1000);
    }
    continuarRepeticion(sesionReproduccion);
});

/**
 * Aplica un estado recibido del servidor.
 * @param {Object} estado - Estado de repetición difundido por el servidor.
 */
function aplicar(estado) {
    if (!estado || estado.id === ultimoId) return;
    ultimoId = estado.id;

    if (estado.cmd === 'play' && estado.url) {
        reproducir(estado);
    } else {
        detener();
    }
}

/**
 * Muestra el aviso de silencio solo cuando hay vídeo reproduciéndose en mudo
 * (y, por CSS, solo fuera de OBS o con ?debug=1).
 */
function actualizarBadgeMute() {
    mutedBadge.hidden = !(video.muted && video.getAttribute('src') && !video.paused);
}

video.addEventListener('volumechange', actualizarBadgeMute);
video.addEventListener('playing', actualizarBadgeMute);
video.addEventListener('pause', actualizarBadgeMute);

// Un clic en cualquier parte activa el sonido (es un gesto de usuario válido).
document.addEventListener('click', () => {
    if (video.muted) {
        video.muted = false;
        sonidoBloqueado = false;
    }
});

/**
 * Abre el canal SSE. EventSource reconecta solo si se cae.
 */
function conectar() {
    const source = new EventSource('/api/replay/events');
    source.onmessage = (event) => {
        try {
            aplicar(JSON.parse(event.data));
        } catch (error) {
            console.warn('Mensaje SSE no válido:', error);
        }
    };
    source.onerror = () => {
        console.warn('SSE desconectado, reintentando…');
    };
}

mostrarEspera(true);
conectar();
