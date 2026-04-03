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

// Estado global
let pc = null; // WebRTC PeerConnection

/**
 * Actualiza el estado visual del reproductor.
 * @param {string} status - Clase visual a aplicar.
 * @param {string} text - Texto descriptivo del estado.
 */
function updateStatus(status, text) {
    statusEl.className = `status ${status}`;
    statusEl.textContent = text;
}


// Control de reproducción
/**
 * Inicia la reproducción del stream indicado por el usuario.
 */
async function startPlay() {
    if (!streamName) {
        alert('Por favor, introduce el nombre del stream');
        return;
    }

    stopPlay(); // Detener cualquier reproducción anterior
    await playWebRTC(server.value, streamName.value);
}

function stopPlay() {
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
}


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

        console.log('WebRTC iniciado correctamente');
        
    } catch (error) {
        console.error('Error en WebRTC:', error);
        updateStatus('disconnected', 'Error al conectar');
        alert('Error al iniciar WebRTC: ' + error.message);
        stopPlay();
    }
}

// Registrar actividad básica del vídeo.
video.addEventListener('play', () => {
    console.log('Video iniciado');
});