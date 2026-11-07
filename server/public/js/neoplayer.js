/**
 * SALIDA DE CÁMARA PARA OBS (neoplayer.html?stream=cam1)
 * Vídeo WHEP a pantalla completa con audio y reconexión infinita: si el emisor
 * cae, se reengancha solo en cuanto vuelve. Dentro de OBS no se muestra nada
 * más que el vídeo.
 */

let server;
let pc;
let streamName;
let whepSession = null;
let video = document.getElementById('videoPlayer');
let esperaEl = document.getElementById('espera');
let avisoSonidoEl = document.getElementById('avisoSonido');

// Reconexión automática
let reconnectTimer = null;  // Temporizador de reintento pendiente
let disconnectTimer = null; // Margen de gracia ante 'disconnected' transitorio
let isConnecting = false;   // Evita conexiones solapadas
const RECONNECT_DELAY_MS = 2000;
const ICE_DISCONNECT_GRACE_MS = 4000;

const parametros = new URLSearchParams(window.location.search);
// En OBS (window.obsstudio) no se muestra ningún aviso salvo con ?debug=1
const modoDepuracion = !window.obsstudio || parametros.get('debug') === '1';
if (modoDepuracion) document.documentElement.classList.add('depuracion');
if (parametros.get('fondo') === 'transparente') document.documentElement.classList.add('transparente');
if (parametros.get('ajuste') === 'cubrir' || parametros.get('ajuste') === 'cover') video.classList.add('cubrir');
// Fuera de OBS se dejan los controles nativos (volumen, pantalla completa)
if (!window.obsstudio) video.controls = true;

/**
 * Cierra la conexión WebRTC actual y desengancha sus manejadores para que su
 * propio cierre no dispare otra reconexión.
 */
function cerrarConexion() {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
    if (pc) {
        pc.ontrack = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
        pc = null;
    }
    if (whepSession) {
        fetch(whepSession, { method: 'DELETE' }).catch(() => {});
        whepSession = null;
    }
}

/**
 * Programa un reintento de conexión. Mientras no haya emisor, el WHEP fallará
 * y se seguirá reintentando; en cuanto el emisor vuelva, se reengancha solo.
 */
function programarReconexion() {
    if (reconnectTimer) return; // Ya hay un reintento programado
    esperaEl.hidden = false;
    video.classList.remove('reproduciendo');
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        playWebRTC(server, streamName);
    }, RECONNECT_DELAY_MS);
}

function caida() {
    video.srcObject = null;
    cerrarConexion();
    programarReconexion();
}

/**
 * Reproduce con sonido; si el navegador lo bloquea (fuera de OBS, sin gesto
 * del usuario), sigue en silencio y ofrece activarlo con un clic.
 */
function reproducirConSonido() {
    video.muted = false;
    video.play().then(() => {
        avisoSonidoEl.hidden = true;
    }).catch(error => {
        if (error.name === 'AbortError') return;
        video.muted = true;
        video.play().catch(() => {});
        avisoSonidoEl.hidden = false;
    });
}

async function playWebRTC(server, streamName) {
    if (isConnecting) return; // Ya hay un intento de conexión en curso
    isConnecting = true;

    cerrarConexion();

    try {
        const conexion = new RTCPeerConnection();
        pc = conexion;

        conexion.ontrack = (event) => {
            video.srcObject = event.streams[0];
            esperaEl.hidden = true;
            video.classList.add('reproduciendo');
            if (event.track.kind === 'audio') reproducirConSonido();
        };

        conexion.oniceconnectionstatechange = () => {
            if (pc !== conexion) return; // Conexión ya reemplazada
            const estado = conexion.iceConnectionState;
            if (estado === 'connected' || estado === 'completed') {
                clearTimeout(disconnectTimer);
                disconnectTimer = null;
            } else if (estado === 'disconnected') {
                // Microcorte: margen antes de reconectar (no cortar la imagen en directo por un parpadeo)
                if (!disconnectTimer) {
                    disconnectTimer = setTimeout(() => {
                        disconnectTimer = null;
                        if (pc === conexion && conexion.iceConnectionState !== 'connected' && conexion.iceConnectionState !== 'completed') caida();
                    }, ICE_DISCONNECT_GRACE_MS);
                }
            } else if (estado === 'failed' || estado === 'closed') {
                caida();
            }
        };

        conexion.addTransceiver('video', { direction: 'recvonly' });
        conexion.addTransceiver('audio', { direction: 'recvonly' });

        const offer = await conexion.createOffer();
        await conexion.setLocalDescription(offer);

        const url = `${construirBaseUrlWebRTC(server)}/${encodeURIComponent(streamName)}/whep`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: offer.sdp
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const location = response.headers.get('Location');
        if (pc === conexion && location) whepSession = new URL(location, url).toString();

        await conexion.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: await response.text()
        }));
    } catch (error) {
        console.warn('WHEP no disponible, se reintentará:', error.message);
        cerrarConexion();
        programarReconexion();
    } finally {
        isConnecting = false;
    }
}

/**
 * Sin ?stream=: en lugar de reintentar sin fin contra un nombre vacío, se
 * muestra un selector con las cámaras que están emitiendo.
 */
async function mostrarSelector() {
    let selector = document.getElementById('selector');
    let lista = document.getElementById('selectorLista');
    selector.hidden = false;
    video.hidden = true;

    try {
        let respuesta = await fetch('/api/mediamtx/v3/paths/list');
        let datos = await respuesta.json();
        let listos = (datos.items || []).filter(p => p.ready).map(p => p.name).sort();
        if (!listos.length) {
            lista.innerHTML = '<li>Ninguna cámara está emitiendo ahora. Recarga cuando haya alguna.</li>';
            return;
        }
        lista.innerHTML = listos.map(nombre => {
            let href = `neoplayer.html?stream=${encodeURIComponent(nombre)}`;
            let completa = new URL(href, window.location.href).toString();
            return `<li><a href="${escapeHtml(href)}" data-camara="${escapeHtml(nombre)}">${escapeHtml(nombre)}<span>${escapeHtml(completa)}</span></a></li>`;
        }).join('');
        lista.querySelectorAll('[data-camara]').forEach(enlace => {
            enlace.style.setProperty('--cam', colorDeCamara(enlace.dataset.camara));
        });
    } catch (error) {
        lista.innerHTML = `<li>No se pudo consultar MediaMTX: ${escapeHtml(error.message)}</li>`;
    }
}

// Un clic (gesto de usuario) permite activar el sonido
document.addEventListener('click', () => {
    if (video.srcObject && video.muted) reproducirConSonido();
});

window.addEventListener('pagehide', () => {
    if (whepSession) fetch(whepSession, { method: 'DELETE', keepalive: true }).catch(() => {});
});

document.addEventListener('DOMContentLoaded', () => {
    server = window.location.hostname; // sin el puerto de la página: WebRTC va a MediaMTX (:8889)
    streamName = (parametros.get('stream') || '').trim();

    if (!streamName) {
        mostrarSelector();
        return;
    }
    document.title = `${streamName} | Salida de cámara`;
    playWebRTC(server, streamName);
});
