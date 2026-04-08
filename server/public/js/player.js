/**
 * REPRODUCTOR WHEP - MEDIA MTX
 * Gestiona la reproducción WebRTC de un stream publicado por el servidor.
 */

// Elementos DOM
let statusEl = document.getElementById('status')
let stopBtn = document.getElementById('stopBtn')
let server = document.getElementById('server')
let streamName = document.getElementById('streamName')
let video = document.getElementById('video');
let endpointButtons = document.getElementById('endpointButtons');

// Estado global
let pc = null; // WebRTC PeerConnection
let activePaths = []; // Paths activos en MediaMTX
let inboundStatsWatchdog = null; // Watchdog compartido para recepción RTP
let isStoppingPlay = false; // Evita ejecuciones solapadas de stopPlay

const PLAYER_STATS_INTERVAL_MS = 500;
const STALLED_BYTES_RECEIVED_MAX_SAMPLES = 2;




// UI
/**
 * Actualiza el estado visual del reproductor.
 * @param {string} status - Clase visual a aplicar.
 * @param {string} text - Texto descriptivo del estado.
 */
function updateStatus(status, text) {
    statusEl.className = `status ${status}`;
    statusEl.textContent = text;
}




// CONTROL DE REPRODUCCIÓN
/**
 * Inicia la reproducción del stream indicado por el usuario.
 */
async function startPlay() {
    if (!streamName.value.trim()) {
        alert('Por favor, introduce el nombre del stream');
        streamName.focus();
        return;
    }

    localStorage.setItem('player_server', server.value.trim());
    localStorage.setItem('player_streamName', streamName.value.trim());

    stopPlay(); // Detener cualquier reproducción anterior
    await playWebRTC(server.value.trim(), streamName.value.trim());
}

function stopPlay() {
    if (isStoppingPlay) return;
    isStoppingPlay = true;

    stopInboundStatsPolling();

    // Cerrar la conexión WebRTC si existe.
    if (pc) {
        pc.close();
        pc = null;
    }
    
    // Limpiar el elemento de vídeo.
    video.pause();
    video.srcObject = null;
    video.src = '';
    
    updateStatus('disconnected', 'Desconectado');
    stopBtn.disabled = true;
    isStoppingPlay = false;
}




// WATCHDOG DE RECEPCIÓN RTP
/**
 * Lee estadísticas inbound-rtp y detecta si el stream se ha quedado sin recibir tráfico.
 */
async function actualizarInboundStats() {
    if (!pc) return;

    try {
        let stats = await pc.getStats();
        let totalBytesReceived = 0;
        let inboundRows = 0;

        stats.forEach(report => {
            if (report.type !== 'inbound-rtp' || report.isRemote) return;
            if (report.kind !== 'audio' && report.kind !== 'video') return;

            inboundRows += 1;
            totalBytesReceived += typeof report.bytesReceived === 'number' ? report.bytesReceived : 0;
        });

        return {
            monitorable: inboundRows > 0,
            totalBytes: totalBytesReceived
        };
    } catch (error) {
        console.warn('No se pudieron leer estadísticas inbound WebRTC:', error);
        return { monitorable: false, totalBytes: 0 };
    }
}

/**
 * Inicia la vigilancia de bytesReceived para detectar cortes silenciosos.
 */
function startInboundStatsPolling() {
    stopInboundStatsPolling();

    inboundStatsWatchdog = createTrafficWatchdog({
        intervalMs: PLAYER_STATS_INTERVAL_MS,
        maxStalledSamples: STALLED_BYTES_RECEIVED_MAX_SAMPLES,
        sample: actualizarInboundStats,
        onStalled: () => {
            console.warn('bytesReceived estancado, deteniendo reproducción');
            stopPlay();
        },
        onError: error => {
            console.warn('No se pudieron leer estadísticas inbound WebRTC:', error);
        }
    });

    inboundStatsWatchdog.start();
}

/**
 * Detiene la vigilancia de bytesReceived.
 */
function stopInboundStatsPolling() {
    if (inboundStatsWatchdog) {
        inboundStatsWatchdog.stop();
        inboundStatsWatchdog = null;
    }
}



// REPRODUCCIÓN WHEP
/**
 * Conecta con el servidor mediante WHEP y empieza a recibir el stream.
 * @param {string} server - Host o IP del servidor MediaMTX.
 * @param {string} streamName - Nombre del stream a reproducir.
 */
async function playWebRTC(server, streamName) {
    updateStatus('connecting', 'Conectando WebRTC...');
    
    try {
        // pc = new RTCPeerConnection({
        //     iceServers: [{
        //         urls: 'stun:stun.l.google.com:19302'
        //     }]
        // });
        
        pc = new RTCPeerConnection();
        
        
        // Renderizar el stream cuando lleguen pistas remotas.
        pc.ontrack = (event) => {
            console.log('Track recibido:', event.track.kind);
            video.srcObject = event.streams[0];
            updateStatus('connected', 'Conectado (WebRTC)');
            stopBtn.disabled = false;
        };
        
        // Vigilar cambios de estado de ICE.
        pc.oniceconnectionstatechange = () => {
            console.log('ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || 
                pc.iceConnectionState === 'failed' ||
                pc.iceConnectionState === 'closed') {
                updateStatus('disconnected', 'Desconectado');
                stopBtn.disabled = true;
            }
        };

        // Solicitar recepción de audio y vídeo.
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        // Crear la oferta SDP local.
        let offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Enviar la oferta al endpoint WHEP.
        let url = `http://${server}:8889/${streamName}/whep`;
        console.log('WHEP URL:', url);
        

        // Intercambiar SDP con el servidor.
        let response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: offer.sdp
        });

        // Validar la respuesta del servidor.
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        let answerSDP = await response.text();
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));

        startInboundStatsPolling();

        console.log('WebRTC iniciado correctamente');
        
    } catch (error) {
        console.error('Error en WebRTC:', error);
        updateStatus('disconnected', 'Error al conectar');
        alert('Error al iniciar WebRTC: ' + error.message);
        stopPlay();
    }
}

/**
 * Rellena el input y lanza la reproducción al pulsar un endpoint rápido.
 * @param {string} endpoint - Endpoint seleccionado.
 */
async function reproducirEndpointRapido(endpoint) {
    streamName.value = endpoint;
    streamName.focus();
    await startPlay();
}



// ENDPOINTS MEDIAMTX
/**
 * Renderiza botones rápidos para seleccionar un endpoint activo.
 */
function ponerBotonesEndpoint() {
    if (!endpointButtons) return;

    if (activePaths.length === 0) {
        endpointButtons.innerHTML = '<span class="empty">Sin endpoints disponibles</span>';
        return;
    }

    endpointButtons.innerHTML = activePaths
        .map(path => `<button type="button" onclick='reproducirEndpointRapido(${JSON.stringify(path)})'>${escapeHtml(path)}</button>`)
        .join('');
}

/**
 * Carga paths activos usando la API de MediaMTX.
 */
async function actualizarPathsActivosPlayer() {
    if (!endpointButtons) return;

    endpointButtons.innerHTML = '<span class="loading">Cargando...</span>';

    try {
        let data = await GET('/paths/list');
        activePaths = [];

        if (data.items && data.items.length > 0) {
            activePaths = data.items
                .filter(path => path.ready)
                .map(path => path.name);
        }

        ponerBotonesEndpoint();
    } catch (error) {
        console.error('Error al cargar paths activos:', error);
        endpointButtons.innerHTML = '<span class="error">No se pudo cargar la lista</span>';
    }
}




// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', async () => {
    let savedServer = window.location.origin.replace(/^https?:\/\//, '');
    let savedStream = localStorage.getItem('player_streamName');
    
    if (savedServer) server.value = savedServer;
    if (savedStream) streamName.value = savedStream;

    await actualizarPathsActivosPlayer();
});

// Registrar actividad básica del vídeo.
video.addEventListener('play', () => {
    console.log('Video iniciado');
});