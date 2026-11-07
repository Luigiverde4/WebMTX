/**
 * REPRODUCTOR WHEP - MEDIA MTX
 * Gestiona la reproducción WebRTC de un stream publicado por el servidor,
 * con reconexión automática y vigilancia del tráfico recibido.
 */

// Elementos DOM
let statusEl = document.getElementById('status');
let stopBtn = document.getElementById('stopBtn');
let server = document.getElementById('server');
let streamName = document.getElementById('streamName');
let video = document.getElementById('video');
let videoVacio = document.getElementById('videoVacio');
let endpointButtons = document.getElementById('endpointButtons');

// Estado global
let pc = null; // WebRTC PeerConnection
let whepSession = null; // URL de la sesión WHEP (para cerrarla al parar)
let activePaths = []; // Paths activos en MediaMTX
let isStoppingPlay = false; // Evita ejecuciones solapadas de stopPlay

// Reconexión automática
let playerActivo = false;   // El usuario quiere estar reproduciendo (controla si se reintenta)
let isConnecting = false;   // Evita conexiones solapadas
let reconnectTimer = null;  // Temporizador de reintento pendiente
let disconnectTimer = null; // Margen de gracia ante un 'disconnected' transitorio de ICE
let currentServer = '';     // Último server usado (para reconectar)
let currentStream = '';     // Último stream usado (para reconectar)
const RECONNECT_DELAY_MS = 2000;
const ICE_DISCONNECT_GRACE_MS = 4000; // Espera antes de tratar 'disconnected' como caída real

// Watchdog de recepción: si no llegan bytes durante 4 s, se reconecta
let inboundWatchdog = null;
let muestraRecepcionPrevia = null;
const INBOUND_STATS_INTERVAL_MS = 1000;
const STALLED_BYTES_RECEIVED_MAX_SAMPLES = 4;

// Sondeo de endpoints activos
let pollPathsTimer = null;       // Intervalo de refresco automático
let ultimoPathsRender = '';      // Firma del último render (evita parpadeo si no cambia nada)
const POLL_PATHS_INTERVAL_MS = 4000;


// UI
/**
 * Actualiza el estado visual del reproductor (píldora y tally).
 * @param {'inactivo'|'conectando'|'recibiendo'|'error'} status
 * @param {string} text - Texto descriptivo del estado.
 */
function actualizarEstado(status, text) {
    statusEl.className = `estado estado--${status}`;
    statusEl.textContent = text;

    if (status === 'recibiendo') {
        ponerTally('recibiendo', { estado: 'Recibiendo', detalle: currentStream, cronometro: true });
    } else if (status === 'conectando') {
        ponerTally('conectando', { estado: text, detalle: currentStream });
    } else if (status === 'error') {
        ponerTally('error', { estado: text, detalle: currentStream });
    } else {
        ponerTally('inactivo', { estado: 'Sin señal', detalle: 'Elige una cámara' });
    }
    videoVacio.hidden = status === 'recibiendo';
}


// CONTROL DE REPRODUCCIÓN
/**
 * Inicia la reproducción del stream indicado por el usuario.
 */
async function startPlay() {
    let nombre = streamName.value.trim();
    if (!nombre) {
        mostrarAviso('Escribe el nombre de la cámara o elige una de la lista.', 'aviso');
        streamName.focus();
        return;
    }

    localStorage.setItem('player_streamName', nombre);

    stopPlay(); // Detener cualquier reproducción anterior
    playerActivo = true; // A partir de aquí, reintentar si se cae la conexión
    await playWebRTC(server.value.trim(), nombre);
}

/**
 * Para la reproducción a petición del usuario (sin reconectar).
 */
function stopPlay() {
    if (isStoppingPlay) return;
    isStoppingPlay = true;

    // Parada solicitada por el usuario: desactivar la reconexión automática.
    playerActivo = false;
    limpiarReconexion();
    cerrarConexion();

    // Limpiar el elemento de vídeo.
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');

    actualizarEstado('inactivo', 'Desconectado');
    stopBtn.disabled = true;
    ponerBotonesEndpoint(); // Quitar el resaltado del endpoint
    isStoppingPlay = false;
}

/**
 * Cierra la conexión WebRTC actual (y su sesión WHEP en el servidor) y
 * desengancha sus manejadores para que su propio cierre no dispare la reconexión.
 */
function cerrarConexion() {
    cancelarDesconexionTransitoria();
    pararPollingStatsEntrantes();
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
 * Cancela el margen de gracia pendiente ante un 'disconnected' transitorio.
 */
function cancelarDesconexionTransitoria() {
    if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
    }
}

/**
 * Cancela un reintento de reconexión pendiente.
 */
function limpiarReconexion() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

/**
 * Programa un reintento de conexión si el usuario sigue queriendo reproducir.
 */
function programarReconexion() {
    if (!playerActivo || reconnectTimer) return;
    actualizarEstado('conectando', 'Reconectando');
    stopBtn.disabled = false; // Permitir cancelar los reintentos
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (playerActivo) playWebRTC(currentServer, currentStream);
    }, RECONNECT_DELAY_MS);
}

/**
 * Gestiona una caída de la conexión: limpia el vídeo, cierra y reconecta si
 * el usuario seguía queriendo reproducir.
 */
function manejarCaidaConexion() {
    video.srcObject = null;
    cerrarConexion();

    if (playerActivo) {
        programarReconexion();
    } else {
        actualizarEstado('inactivo', 'Desconectado');
        stopBtn.disabled = true;
    }
}

/**
 * Ante un 'disconnected' de ICE, espera un margen de gracia por si se recupera
 * solo. Si al expirar sigue sin estar conectado, lo trata como caída.
 * @param {RTCPeerConnection} conexion - Conexión que entró en 'disconnected'.
 */
function programarComprobacionDesconexion(conexion) {
    if (disconnectTimer) return; // Ya hay una comprobación en marcha
    actualizarEstado('conectando', 'Conexión inestable');

    disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        if (pc !== conexion) return; // La conexión ya fue reemplazada

        const estadoICE = conexion.iceConnectionState;
        if (estadoICE !== 'connected' && estadoICE !== 'completed') {
            console.warn('ICE sigue caído tras el margen de gracia, reconectando');
            manejarCaidaConexion();
        }
    }, ICE_DISCONNECT_GRACE_MS);
}


// WATCHDOG DE RECEPCIÓN RTP
/**
 * Lee inbound-rtp, pinta los datos de recepción y devuelve los bytes recibidos.
 * @returns {Promise<{monitorable: boolean, totalBytes: number}>}
 */
async function actualizarInboundStats() {
    if (!pc) return { monitorable: false, totalBytes: 0 };

    let stats = await pc.getStats();
    let totalBytes = 0;
    let hayInbound = false;
    let perdidos = 0;
    let recibidos = 0;
    let videoReport = null;

    stats.forEach(report => {
        if (report.type !== 'inbound-rtp') return;
        hayInbound = true;
        totalBytes += report.bytesReceived || 0;
        perdidos += report.packetsLost || 0;
        recibidos += report.packetsReceived || 0;
        if (report.kind === 'video') videoReport = report;
    });

    let ahora = performance.now();
    if (muestraRecepcionPrevia && ahora > muestraRecepcionPrevia.t) {
        let kbps = Math.max(0, Math.round(((totalBytes - muestraRecepcionPrevia.bytes) * 8) / (ahora - muestraRecepcionPrevia.t)));
        document.getElementById('recBitrate').textContent = `${(kbps / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} Mbps`;
    }
    muestraRecepcionPrevia = { bytes: totalBytes, t: ahora };

    if (videoReport) {
        document.getElementById('recImagen').textContent = videoReport.frameWidth
            ? `${videoReport.frameWidth}×${videoReport.frameHeight} a ${Math.round(videoReport.framesPerSecond || 0)} fps`
            : 'Esperando fotogramas…';
        let bufer = videoReport.jitterBufferEmittedCount
            ? Math.round((videoReport.jitterBufferDelay / videoReport.jitterBufferEmittedCount) * 1000)
            : null;
        document.getElementById('recBufer').textContent = bufer !== null ? `${bufer} ms` : '—';
    }
    let total = perdidos + recibidos;
    document.getElementById('recPerdidos').textContent = total
        ? `${perdidos.toLocaleString('es-ES')} (${((perdidos / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %)`
        : '—';

    return { monitorable: hayInbound, totalBytes };
}

/**
 * Arranca la vigilancia de bytes recibidos: si se estancan, se reconecta.
 */
function empezarPollingStatsEntrantes() {
    pararPollingStatsEntrantes();
    muestraRecepcionPrevia = null;
    inboundWatchdog = createTrafficWatchdog({
        intervalMs: INBOUND_STATS_INTERVAL_MS,
        maxStalledSamples: STALLED_BYTES_RECEIVED_MAX_SAMPLES,
        sample: actualizarInboundStats,
        onStalled: () => {
            console.warn('bytesReceived estancado: reconectando');
            if (playerActivo) mostrarAviso(`No llegan datos de ${currentStream}. Reconectando…`, 'aviso');
            manejarCaidaConexion();
        },
        onError: error => console.warn('No se pudieron leer estadísticas de recepción:', error)
    });
    inboundWatchdog.start();
}

function pararPollingStatsEntrantes() {
    if (inboundWatchdog) {
        inboundWatchdog.stop();
        inboundWatchdog = null;
    }
    ['recImagen', 'recBitrate', 'recPerdidos', 'recBufer'].forEach(id => {
        document.getElementById(id).textContent = '—';
    });
}


// REPRODUCCIÓN WHEP
/**
 * Conecta con el servidor mediante WHEP y empieza a recibir el stream.
 * @param {string} server - Host o IP del servidor MediaMTX.
 * @param {string} streamName - Nombre del stream a reproducir.
 */
async function playWebRTC(server, streamName) {
    if (isConnecting) return; // Ya hay un intento de conexión en curso
    isConnecting = true;

    currentServer = server;
    currentStream = streamName;
    actualizarEstado('conectando', 'Conectando');
    ponerBotonesEndpoint();

    // Cerrar cualquier conexión previa antes de crear una nueva.
    cerrarConexion();

    try {
        const conexion = new RTCPeerConnection();
        pc = conexion;

        // Renderizar el stream cuando lleguen pistas remotas.
        conexion.ontrack = (event) => {
            console.log('Track recibido:', event.track.kind);
            video.srcObject = event.streams[0];
            actualizarEstado('recibiendo', 'Recibiendo');
            stopBtn.disabled = false;
            ponerBotonesEndpoint(); // Resaltar el endpoint en reproducción
            if (!inboundWatchdog) empezarPollingStatsEntrantes();
        };

        // Vigilar cambios de estado de ICE.
        conexion.oniceconnectionstatechange = () => {
            if (pc !== conexion) return; // Ignorar conexiones ya reemplazadas

            const estadoICE = conexion.iceConnectionState;
            console.log('ICE state:', estadoICE);

            if (estadoICE === 'connected' || estadoICE === 'completed') {
                // Conectividad (re)establecida: cancelar un posible margen de gracia.
                cancelarDesconexionTransitoria();
                if (video.srcObject) actualizarEstado('recibiendo', 'Recibiendo');
                return;
            }

            if (estadoICE === 'failed' || estadoICE === 'closed') {
                manejarCaidaConexion(); // Fallo duro: caída inmediata
                return;
            }

            if (estadoICE === 'disconnected') {
                // Suele ser transitorio (microcorte de red): margen antes de reconectar.
                programarComprobacionDesconexion(conexion);
            }
        };

        // Solicitar recepción de audio y vídeo.
        conexion.addTransceiver('video', { direction: 'recvonly' });
        conexion.addTransceiver('audio', { direction: 'recvonly' });

        const offer = await conexion.createOffer();
        await conexion.setLocalDescription(offer);

        const url = `${construirBaseUrlWebRTC(server)}/${encodeURIComponent(streamName)}/whep`;
        console.log('WHEP URL:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: offer.sdp
        });

        if (!response.ok) {
            throw new Error(response.status === 404
                ? `${streamName} no está emitiendo`
                : `HTTP ${response.status} ${response.statusText}`);
        }

        // Location relativo (/cam1/whep/<id>): se resuelve contra la URL de WHEP
        const location = response.headers.get('Location');
        if (pc === conexion) {
            whepSession = location ? new URL(location, url).toString() : null;
        } else if (location) {
            fetch(new URL(location, url), { method: 'DELETE' }).catch(() => {});
        }

        const answerSDP = await response.text();
        await conexion.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: anadirCandidatoDelServidor(answerSDP, url)
        }));

        console.log('WebRTC iniciado correctamente');
    } catch (error) {
        console.error('Error en WebRTC:', error);
        cerrarConexion();

        if (playerActivo) {
            // Probablemente el emisor aún no está disponible: reintentar.
            actualizarEstado('conectando', `Esperando a ${streamName}`);
            programarReconexion();
        } else {
            actualizarEstado('error', 'No se pudo conectar');
            stopBtn.disabled = true;
        }
    } finally {
        isConnecting = false;
    }
}

/**
 * Rellena el input y lanza la reproducción al pulsar un endpoint rápido.
 * @param {string} endpoint - Endpoint seleccionado.
 */
async function reproducirEndpointRapido(endpoint) {
    streamName.value = endpoint;
    await startPlay();
}


// ENDPOINTS MEDIAMTX
/**
 * Renderiza botones rápidos para seleccionar un endpoint activo.
 */
function ponerBotonesEndpoint() {
    if (!endpointButtons) return;

    // Resaltar el endpoint que se está reproduciendo ahora mismo.
    let resaltado = playerActivo ? currentStream : '';

    // Solo redibujar si la lista o el resaltado cambian (evita parpadeo al sondear).
    let firma = JSON.stringify(activePaths) + '|' + resaltado;
    if (firma === ultimoPathsRender) return;
    ultimoPathsRender = firma;

    if (activePaths.length === 0) {
        endpointButtons.innerHTML = '<p class="texto-2 texto-peq">Ninguna cámara está emitiendo ahora mismo. La lista se actualiza sola.</p>';
        return;
    }

    endpointButtons.innerHTML = activePaths
        .map(path => {
            let activo = path === resaltado;
            return `<button type="button" class="chip-camara${activo ? ' activo' : ''}" aria-pressed="${activo}" data-camara="${escapeHtml(path)}" onclick='reproducirEndpointRapido(${escapeHtml(JSON.stringify(path))})'>
                <span class="chip-camara__nombre">${escapeHtml(path)}</span>
                ${activo ? '<span class="chip-camara__estado">En monitor</span>' : ''}
            </button>`;
        })
        .join('');
    endpointButtons.querySelectorAll('[data-camara]').forEach(chip => aplicarColorCamara(chip, chip.dataset.camara));
}

/**
 * Carga los paths activos desde la API de MediaMTX.
 * @param {boolean} [mostrarCarga] - Mostrar "Cargando..." (solo en la primera carga).
 */
async function actualizarPathsActivosPlayer(mostrarCarga = false) {
    if (!endpointButtons) return;

    if (mostrarCarga) {
        endpointButtons.innerHTML = '<span class="texto-2 texto-peq">Cargando…</span>';
        ultimoPathsRender = ''; // Forzar el primer render tras "Cargando..."
    }

    try {
        let data = await GET('/paths/list');
        activePaths = (data.items || [])
            .filter(path => path.ready)
            .map(path => path.name)
            .sort();
        ponerBotonesEndpoint();
    } catch (error) {
        console.error('Error al cargar paths activos:', error);
        // En el sondeo silencioso no machacamos la lista por un fallo puntual de red.
        if (mostrarCarga) {
            endpointButtons.innerHTML = '<p class="mensaje-linea mensaje-linea--error">No se pudo consultar MediaMTX.</p>';
        }
    }
}


// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', async () => {
    server.value = window.location.hostname; // sin el puerto de la página: WebRTC va a MediaMTX (:8889)
    // ?stream=cam1 abre directamente esa cámara (enlaces desde Inicio)
    let streamUrl = new URLSearchParams(window.location.search).get('stream');
    let savedStream = localStorage.getItem('player_streamName');
    if (streamUrl || savedStream) streamName.value = streamUrl || savedStream;
    actualizarEstado('inactivo', 'Desconectado');

    // Primera carga visible y, a partir de ahí, sondeo automático silencioso.
    await actualizarPathsActivosPlayer(true);
    pollPathsTimer = setInterval(() => {
        if (!document.hidden) actualizarPathsActivosPlayer(false);
    }, POLL_PATHS_INTERVAL_MS);

    if (streamUrl) startPlay();
});

streamName.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') startPlay();
});

// Al cerrar la pestaña, liberar la sesión en el servidor
window.addEventListener('pagehide', () => {
    if (whepSession) fetch(whepSession, { method: 'DELETE', keepalive: true }).catch(() => {});
});
