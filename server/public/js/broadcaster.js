// Elementos DOM
const statusEl = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const serverInput = document.getElementById('server');
const endpointInput = document.getElementById('endpoint');
const preview = document.getElementById('preview');
const videoSource = document.getElementById('videoSource');
const audioSource = document.getElementById('audioSource');
const resolution = document.getElementById('resolution');
const streamUrlEl = document.getElementById('streamUrl');
const liveIndicator = document.getElementById('liveIndicator');
const activePathsList = document.getElementById('activePathsList');

// Variables globales
let pc = null; // WebRTC PeerConnection
let localStream = null; // Stream local de la cámara/micrófono
let whipSession = null; // URL para DELETE al finalizar
let activePaths = []; // Paths activos en MediaMTX

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
    await initializeDevices();
    
    // Intentar cargar configuración guardada
    const savedServer = localStorage.getItem('broadcaster_server');
    const savedEndpoint = localStorage.getItem('broadcaster_endpoint');
    if (savedServer) serverInput.value = savedServer;
    if (savedEndpoint) endpointInput.value = savedEndpoint;
    
    // Cargar paths activos
    await refreshActivePaths();
});

// Consultar API de MediaMTX para obtener paths activos (usa proxy del servidor)
async function refreshActivePaths() {
    activePathsList.innerHTML = '<span class="loading">Cargando...</span>';
    
    try {
        // Usar el proxy del servidor Node.js para evitar CORS y auth
        const response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) throw new Error('API no disponible');
        
        const data = await response.json();
        activePaths = [];
        
        // Filtrar paths que tienen readers o publishers activos
        if (data.items && data.items.length > 0) {
            activePaths = data.items
                .filter(path => path.ready)
                .map(path => path.name);
        }
        
        renderActivePaths();
    } catch (error) {
        console.error('Error consultando API MediaMTX:', error);
        activePathsList.innerHTML = '<span class="error">No se pudo conectar a MediaMTX</span>';
    }
}

function renderActivePaths() {
    if (activePaths.length === 0) {
        activePathsList.innerHTML = '<span class="empty">No hay streams activos</span>';
        return;
    }
    
    activePathsList.innerHTML = activePaths
        .map(path => `<span class="path-tag">${path}</span>`)
        .join('');
}

function isPathActive(endpoint) {
    return activePaths.includes(endpoint);
}

// Obtener lista de dispositivos de audio/video
async function initializeDevices() {
    try {
        // Solicitar permisos primero (necesario para obtener labels)
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach(track => track.stop());
        
        await refreshDevices();
    } catch (error) {
        console.error('Error al inicializar dispositivos:', error);
        updateStatus('disconnected', 'Error: ' + error.message);
    }
}

async function refreshDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Limpiar selects
        videoSource.innerHTML = '';
        audioSource.innerHTML = '';
        
        // Filtrar y añadir dispositivos
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} (${device.deviceId.slice(0, 8)}...)`;
            
            if (device.kind === 'videoinput') {
                videoSource.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioSource.appendChild(option);
            }
        });
        
        // Añadir opción para sin audio
        const noAudioOption = document.createElement('option');
        noAudioOption.value = 'none';
        noAudioOption.text = '🔇 Sin micrófono';
        audioSource.appendChild(noAudioOption);
        
        console.log('Dispositivos actualizados');
    } catch (error) {
        console.error('Error al enumerar dispositivos:', error);
    }
}

// Actualizar estado visual
function updateStatus(status, text) {
    statusEl.className = `status ${status}`;
    statusEl.textContent = text;
}

// Establecer endpoint desde botones rápidos
function setEndpoint(name) {
    endpointInput.value = name;
    endpointInput.focus();
}

// Obtener stream local de la cámara/micrófono
async function getLocalStream() {
    const [width, height] = resolution.value.split('x').map(Number);
    
    const constraints = {
        video: {
            deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: 30 }
        }
    };
    
    // Añadir audio solo si no está desactivado
    if (audioSource.value !== 'none') {
        constraints.audio = {
            deviceId: audioSource.value ? { exact: audioSource.value } : undefined,
            echoCancellation: true,
            noiseSuppression: true
        };
    } else {
        constraints.audio = false;
    }
    
    return await navigator.mediaDevices.getUserMedia(constraints);
}

// Iniciar transmisión WHIP
async function startBroadcast() {
    const endpoint = endpointInput.value.trim();
    const server = serverInput.value.trim();
    
    if (!endpoint) {
        alert('Por favor, introduce un nombre para tu endpoint (ej: ricardo, cam1)');
        endpointInput.focus();
        return;
    }
    
    if (!server) {
        alert('Por favor, introduce la dirección del servidor');
        serverInput.focus();
        return;
    }
    
    // Verificar si el path ya está en uso
    await refreshActivePaths();
    if (isPathActive(endpoint)) {
        const continuar = confirm(`⚠️ El endpoint "${endpoint}" ya está en uso.\n\n¿Quieres continuar de todos modos? (Podría reemplazar el stream existente)`);
        if (!continuar) return;
    }
    
    // Guardar configuración
    localStorage.setItem('broadcaster_server', server);
    localStorage.setItem('broadcaster_endpoint', endpoint);
    
    updateStatus('connecting', 'Conectando...');
    startBtn.disabled = true;
    
    try {
        // Obtener stream local
        localStream = await getLocalStream();
        preview.srcObject = localStream;
        
        // Crear PeerConnection
        pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        // Añadir tracks al peer connection
        localStream.getTracks().forEach(track => {
            console.log('Añadiendo track:', track.kind);
            pc.addTrack(track, localStream);
        });
        
        // Manejar candidatos ICE
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate.candidate);
            }
        };
        
        // Manejar cambios de estado
        pc.oniceconnectionstatechange = () => {
            console.log('ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                updateStatus('live', '🔴 EN VIVO');
                liveIndicator.style.display = 'block';
            } else if (pc.iceConnectionState === 'disconnected' || 
                       pc.iceConnectionState === 'failed' ||
                       pc.iceConnectionState === 'closed') {
                stopBroadcast();
            }
        };
        
        // Crear offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Esperar a que se recopilen todos los candidatos ICE
        await waitForIceGathering(pc);
        
        // Enviar al servidor WHIP
        const whipUrl = `http://${server}:8889/${endpoint}/whip`;
        console.log('WHIP URL:', whipUrl);
        streamUrlEl.textContent = whipUrl;
        
        const response = await fetch(whipUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: pc.localDescription.sdp
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Guardar URL de sesión para poder cerrarla después
        whipSession = response.headers.get('Location');
        console.log('WHIP Session:', whipSession);
        
        const answerSDP = await response.text();
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));
        
        stopBtn.disabled = false;
        console.log('Transmisión WHIP iniciada correctamente');
        
    } catch (error) {
        console.error('Error al iniciar transmisión:', error);
        updateStatus('disconnected', 'Error: ' + error.message);
        alert('Error al iniciar transmisión: ' + error.message);
        stopBroadcast();
    }
}

// Esperar a que se recopilen los candidatos ICE
function waitForIceGathering(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', checkState);
            
            // Timeout de seguridad (5 segundos)
            setTimeout(resolve, 5000);
        }
    });
}

// Detener transmisión
async function stopBroadcast() {
    // Intentar cerrar sesión WHIP en el servidor
    if (whipSession) {
        try {
            await fetch(whipSession, { method: 'DELETE' });
        } catch (e) {
            console.log('Error cerrando sesión WHIP:', e);
        }
        whipSession = null;
    }
    
    // Cerrar PeerConnection
    if (pc) {
        pc.close();
        pc = null;
    }
    
    // Detener stream local
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Actualizar UI
    preview.srcObject = null;
    liveIndicator.style.display = 'none';
    updateStatus('disconnected', 'Sin transmitir');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    streamUrlEl.textContent = '-';
    
    console.log('Transmisión detenida');
}

// Manejar cambio de dispositivos
videoSource.addEventListener('change', async () => {
    if (localStream && !pc) {
        // Solo actualizar preview si no estamos transmitiendo
        try {
            const newStream = await getLocalStream();
            localStream.getTracks().forEach(track => track.stop());
            localStream = newStream;
            preview.srcObject = localStream;
        } catch (e) {
            console.error('Error cambiando cámara:', e);
        }
    }
});

// Detectar cuando se conectan/desconectan dispositivos
navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

// Previsualizar al hacer clic en el video
preview.addEventListener('click', async () => {
    if (!localStream && !pc) {
        try {
            localStream = await getLocalStream();
            preview.srcObject = localStream;
        } catch (e) {
            console.error('Error iniciando preview:', e);
        }
    }
});
