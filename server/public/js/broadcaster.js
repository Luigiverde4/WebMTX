/**
 * EMISOR WHIP - MEDIA MTX
 * Gestiona la publicación de cámara y micrófono hacia el servidor.
 */

/**
 * Elementos DOM
 */
// Información de pantalla
let statusEl = document.getElementById('status');
let streamUrlEl = document.getElementById('streamUrl');
let activePathsList = document.getElementById('activePathsList');
let codecStatsEl = document.getElementById('codecStats');

// Entradas de usuario
let serverInput = document.getElementById('server');
let endpointInput = document.getElementById('endpoint');

// Fuentes multimedia
let videoSource = document.getElementById('videoSource');
let audioSource = document.getElementById('audioSource');
let resolution = document.getElementById('resolution');

// Botones de control
let startBtn = document.getElementById('startBtn');
let stopBtn = document.getElementById('stopBtn');

// Player
let preview = document.getElementById('preview');
let liveIndicator = document.getElementById('liveIndicator');

// Estado global
let pc = null; // WebRTC PeerConnection
let localStream = null; // Stream local de la cámara/micrófono
let whipSession = null; // URL para DELETE al finalizar
let activePaths = []; // Paths activos en MediaMTX
let codecStatsTimer = null; // Intervalo para refrescar estadísticas WebRTC


/**
 * Convierte bytes a texto legible.
 * @param {number} bytes - Cantidad de bytes.
 */
function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '0 B';

    let units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    let rounded = value >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${rounded} ${units[unitIndex]}`;
}

/**
 * Muestra un estado por defecto en el panel de códecs.
 * @param {string} message - Mensaje a mostrar.
 */
function setCodecStatsMessage(message) {
    if (!codecStatsEl) return;
    codecStatsEl.innerHTML = `<span class="empty">${message}</span>`;
}

/**
 * Renderiza una tabla con los códecs/bytes en uso para audio y vídeo.
 * @param {Array<object>} rows - Filas de estadísticas.
 */
function renderCodecStats(rows) {
    if (!codecStatsEl) return;

    if (!rows || rows.length === 0) {
        setCodecStatsMessage('Sin tráfico RTP todavía...');
        return;
    }

    let body = rows
        .map(row => `
            <tr>
                <td>${row.kind}</td>
                <td>${row.mimeType}</td>
                <td>${row.payloadType}</td>
                <td>${row.clockRate}</td>
                <td>${row.channels}</td>
                <td>${formatBytes(row.bytesSent)}</td>
                <td>${formatBytes(row.bytesReceived)}</td>
            </tr>
        `)
        .join('');

    codecStatsEl.innerHTML = `
        <table class="codec-table">
            <thead>
                <tr>
                    <th>Tipo</th>
                    <th>Códec</th>
                    <th>PT</th>
                    <th>Clock</th>
                    <th>Canales</th>
                    <th>Bytes enviados</th>
                    <th>Bytes recibidos</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    `;
}

/**
 * Extrae las estadísticas outbound-rtp (audio/video) del PeerConnection.
 */
async function actualizarCodecStats() {
    if (!pc || !codecStatsEl) return;

    try {
        let stats = await pc.getStats();
        let rows = [];

        stats.forEach(report => {
            if (report.type !== 'outbound-rtp' || report.isRemote) return;
            if (report.kind !== 'audio' && report.kind !== 'video') return;

            let codec = report.codecId ? stats.get(report.codecId) : null;

            rows.push({
                kind: report.kind,
                mimeType: codec && codec.mimeType ? codec.mimeType : 'desconocido',
                payloadType: codec && codec.payloadType !== undefined ? codec.payloadType : 'n/a',
                clockRate: codec && codec.clockRate !== undefined ? codec.clockRate : 'n/a',
                channels: codec && codec.channels !== undefined ? codec.channels : 'n/a',
                bytesSent: typeof report.bytesSent === 'number' ? report.bytesSent : 0,
                bytesReceived: typeof report.bytesReceived === 'number' ? report.bytesReceived : 0
            });
        });

        rows.sort((a, b) => a.kind.localeCompare(b.kind));
        renderCodecStats(rows);
    } catch (error) {
        console.warn('No se pudieron leer estadísticas WebRTC:', error);
        if (codecStatsEl) {
            codecStatsEl.innerHTML = '<span class="error">Error leyendo estadísticas WebRTC</span>';
        }
    }
}

/**
 * Inicia el refresco periódico de estadísticas WebRTC.
 */
function startCodecStatsPolling() {
    stopCodecStatsPolling();
    actualizarCodecStats();
    codecStatsTimer = setInterval(actualizarCodecStats, 2000);
}

/**
 * Detiene el refresco periódico de estadísticas WebRTC.
 */
function stopCodecStatsPolling() {
    if (codecStatsTimer) {
        clearInterval(codecStatsTimer);
        codecStatsTimer = null;
    }
}




// PATHS
/**
 * Renderiza los paths activos en la UI.
 */
function ponerPathsActivos() {
    if (activePaths.length === 0) {
        activePathsList.innerHTML = '<span class="empty">No hay streams activos</span>';
        return;
    }
    
    activePathsList.innerHTML = activePaths
        .map(path => `<span class="path-tag">${path}</span>`)
        .join('');
}

/**
 * Consulta MediaMTX y actualiza la lista de paths activos.
 */
async function actualizarPathsActivos() {
    activePathsList.innerHTML = '<span class="loading">Cargando...</span>';
    
    try {
        // Usar el proxy del servidor Node.js para evitar CORS y auth
        let response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) throw new Error('API no disponible');
        
        let data = await response.json();
        activePaths = [];
        
        // Filtrar únicamente los paths preparados.
        if (data.items && data.items.length > 0) {
            activePaths = data.items
                .filter(path => path.ready)
                .map(path => path.name);
        }
        
        ponerPathsActivos();
    } catch (error) {
        mostrarError('No se pudo conectar a MediaMTX', error);
        activePathsList.innerHTML = '<span class="error">No se pudo conectar a MediaMTX</span>';
    }
}

/**
 * Comprueba si un endpoint ya está en uso.
 * @param {string} endpoint - Nombre del endpoint a verificar.
 */
function esPathActivo(endpoint) {
    // Comprueba si el endpoint deseado ya esta usandose
    return activePaths.includes(endpoint);
}

/**
 * Asigna un endpoint desde los accesos rápidos.
 * @param {string} name - Nombre del endpoint.
 */
function ponerEndpoint(name) {
    endpointInput.value = name;
    endpointInput.focus();
}




// DISPOSITIVOS AUDIOVISUALES
/**
 * Solicita permisos y carga la lista real de dispositivos.
 */
async function iniciarDispositivos() {
    try {
        // Solicitar permisos primero para obtener etiquetas legibles.
        let tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach(track => track.stop());
        
        await actualizarDispositivos();
    } catch (error) {
        mostrarError('No se pudieron inicializar los dispositivos', error);
    }
}

/**
 * Rellena los selectores con las cámaras y micrófonos disponibles.
 */
async function actualizarDispositivos() {
    try {
        // Obtener la lista de dispositivos.
        let devices = await navigator.mediaDevices.enumerateDevices();
        
        // Limpiar selectores.
        videoSource.innerHTML = '';
        audioSource.innerHTML = '';
        
        // Añadir cada dispositivo al selector correspondiente.
        devices.forEach(device => {
            let option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} (${device.deviceId.slice(0, 8)}...)`;
            
            // Vídeo.
            if (device.kind === 'videoinput') {
                videoSource.appendChild(option);
            
            // Audio.
            } else if (device.kind === 'audioinput') {
                audioSource.appendChild(option);
            }
        });
        
        // Añadir opción para sin audio.
        let noAudioOption = document.createElement('option');
        noAudioOption.value = 'none';
        noAudioOption.text = '🔇 Sin micrófono';
        audioSource.appendChild(noAudioOption);
        
        console.log('Dispositivos actualizados');
    } catch (error) {
        mostrarError('No se pudieron enumerar los dispositivos', error);
    }
}

/**
 * Obtiene un stream local según la configuración elegida por el usuario.
 */
async function cogerStreamVideoAudioLocal() {
    // Obtener la resolución seleccionada.
    let [width, height] = resolution.value.split('x').map(Number);
    
    // Configurar restricciones de vídeo.
    let letraints = {
        video: {
            deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: 30 }
        }
    };
    
    // Añadir audio solo si no está desactivado.
    if (audioSource.value !== 'none') {
        letraints.audio = {
            deviceId: audioSource.value ? { exact: audioSource.value } : undefined,
            echoCancellation: true,
            noiseSuppression: true
        };
    } else {
        letraints.audio = false;
    }
    
    return await navigator.mediaDevices.getUserMedia(letraints);
}

/**
 * Cambia el dispositivo local si todavía no hay transmisión activa.
 */
async function cambioDispositivo() {
    // Evitar interrumpir un stream ya publicado.
    if (localStream && !pc) {
        try {
            // Sustituir el stream por el nuevo dispositivo seleccionado.
            let newStream = await cogerStreamVideoAudioLocal();
            localStream.getTracks().forEach(track => track.stop());
            localStream = newStream;
            preview.srcObject = localStream;
        } catch (e) {
            mostrarError('No se pudo cambiar la cámara', e);
        }
    }
}



// INTERFAZ
/**
 * Actualiza el estado visual del emisor.
 * @param {string} status - Clase visual a aplicar.
 * @param {string} text - Texto a mostrar.
 */


/**
 * Actualiza el estado visual del emisor.
 * @param {string} status 
 * @param {string} text 
 */
function updateStatus(status, text) {
    statusEl.className = `status ${status}`;
    statusEl.textContent = text;
}



/**
 * Muestra la previsualización local cuando aún no existe stream activo.
 */
async function visualizarPreview() {
    if (!localStream && !pc) {
        try {
            localStream = await cogerStreamVideoAudioLocal();
            preview.srcObject = localStream;
        } catch (e) {
            mostrarError('No se pudo iniciar la previsualización', e);
        }
    }
}

/**
 * Muestra un error al usuario, actualiza la cabecera y deja detalle técnico en consola.
 * @param {string} userMessage - Mensaje breve para alert y cabecera.
 * @param {Error|string} error - Detalle técnico del fallo.
 */
function mostrarError(userMessage, error) {
    let detail = error && error.message ? error.message : String(error || 'Error desconocido');
    console.error(userMessage, error);
    updateStatus('disconnected', 'Error: ' + userMessage);
    alert(userMessage + '\n\nDetalle: ' + detail);
}




// PUBLICACIÓN 
/**
 * Inicia la publicación WHIP del stream local.
 */
async function startBroadcast() {
    // Leer la configuración actual.
    let endpoint = endpointInput.value.trim();
    let server = serverInput.value.trim();
    
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
    
    // Verificar si el endpoint ya está ocupado.
    await actualizarPathsActivos();
    if (esPathActivo(endpoint)) {
        let continuar = confirm(`⚠️ El endpoint "${endpoint}" ya está en uso.\n\n¿Quieres continuar de todos modos? (Podría reemplazar el stream existente)`);
        if (!continuar) return;
    }
    
    // Persistir configuración de usuario.
    localStorage.setItem('broadcaster_server', server);
    localStorage.setItem('broadcaster_endpoint', endpoint);
    
    updateStatus('connecting', 'Conectando...');
    startBtn.disabled = true;
    
    try {
        // Obtener stream local.
        localStream = await cogerStreamVideoAudioLocal();
        preview.srcObject = localStream;
        
        // Crear la conexión WebRTC.
        // pc = new RTCPeerConnection({
        //     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // });
        
        pc = new RTCPeerConnection();
        
        // Añadir las pistas locales al peer connection.
        localStream.getTracks().forEach(track => {
            console.log('Añadiendo track:', track.kind);
            pc.addTrack(track, localStream);
        });
        
        // Registrar candidatos ICE a modo de depuración.
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate.candidate);
            }
        };
        
        // Vigilar el estado de la conexión.
        pc.oniceconnectionstatechange = () => {
            console.log('ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                updateStatus('connecting', 'Conectado, verificando emisión...');
            } else if (pc.iceConnectionState === 'disconnected' || 
                       pc.iceConnectionState === 'failed' ||
                       pc.iceConnectionState === 'closed') {
                stopBroadcast();
            }
        };
        
        // Crear la oferta SDP.
        let offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Esperar a que termine la recopilación ICE.
        await waitForIceGathering(pc);
        
        // Publicar la oferta en el endpoint WHIP.
        let whipUrl = `http://${server}:8889/${endpoint}/whip`;
        console.log('WHIP URL:', whipUrl);
        streamUrlEl.textContent = whipUrl;
        
        let response = await fetch(whipUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: pc.localDescription.sdp
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Guardar la URL de sesión para cerrarla después.
        whipSession = response.headers.get('Location');
        console.log('WHIP Session:', whipSession);
        
        let answerSDP = await response.text();
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));

        // Esperar a confirmar tráfico real antes de marcar la emisión como activa.
        await waitForOutgoingStream(pc);

        updateStatus('live', '🔴 EN VIVO');
        liveIndicator.style.display = 'block';
        startCodecStatsPolling();
        
        stopBtn.disabled = false;
        console.log('Transmisión WHIP iniciada correctamente');
        
    } catch (error) {
        mostrarError('Error al iniciar transmisión', error);
        stopBroadcast();
    }
    // Dar margen para que MediaMTX actualice el estado de paths.
    setTimeout(actualizarPathsActivos, 1000);
}

/**
 * Detiene la transmisión y libera recursos locales.
 */
async function stopBroadcast() {
    stopCodecStatsPolling();

    // Intentar cerrar la sesión WHIP en el servidor.
    if (whipSession) {
        try {
            await fetch(whipSession, { method: 'DELETE' });
        } catch (e) {
            mostrarError('No se pudo cerrar la sesión WHIP', e);
        }
        whipSession = null;
    }
    
    // Cerrar la conexión WebRTC.
    if (pc) {
        pc.close();
        pc = null;
    }
    
    // Detener el stream local.
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Actualizar la interfaz.
    preview.srcObject = null;
    liveIndicator.style.display = 'none';
    updateStatus('disconnected', 'Sin transmitir');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    streamUrlEl.textContent = '-';
    setCodecStatsMessage('Sin datos (inicia transmisión)');
    
    console.log('Transmisión detenida');
    // Dar margen para que MediaMTX actualice el estado de paths.
    setTimeout(actualizarPathsActivos, 1000);
}

/**
 * Espera hasta que termine la recopilación de ICE candidates.
 * @param {RTCPeerConnection} pc - Conexión en negociación.
 */
function waitForIceGathering(pc) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
        } else {
            let checkState = () => {
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

/**
 * Espera a que el peer connection empiece a enviar tráfico real.
 * @param {RTCPeerConnection} pc - Conexión en negociación.
 */
function waitForOutgoingStream(pc) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let lastBytesSent = new Map();
        let timeoutId = null;

        let finish = (callback, value) => {
            if (finished) return;
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            callback(value);
        };

        let checkStats = async () => {
            if (finished) return;

            if (!pc || pc.connectionState === 'closed' || pc.iceConnectionState === 'closed') {
                finish(reject, new Error('La conexión se cerró antes de confirmar el envío del stream'));
                return;
            }

            try {
                let stats = await pc.getStats();
                let hasOutgoingTraffic = false;

                stats.forEach(report => {
                    if (report.type !== 'outbound-rtp' || report.isRemote) return;

                    let bytesSent = typeof report.bytesSent === 'number' ? report.bytesSent : 0;
                    let previousBytesSent = lastBytesSent.get(report.id) || 0;

                    if (bytesSent > 0 || bytesSent > previousBytesSent) {
                        hasOutgoingTraffic = true;
                    }

                    lastBytesSent.set(report.id, bytesSent);
                });

                if (hasOutgoingTraffic) {
                    finish(resolve);
                    return;
                }

                setTimeout(checkStats, 300);
            } catch (error) {
                finish(reject, error);
            }
        };

        timeoutId = setTimeout(() => {
            finish(reject, new Error('No se pudo confirmar que el stream esté enviándose'));
        }, 10000);

        checkStats();
    });
}




// EVENTOS
// Inicializar al cargar la página.
document.addEventListener('DOMContentLoaded', async () => {
    await iniciarDispositivos();
    
    // Restaurar la configuración guardada.
    let savedServer = localStorage.getItem('broadcaster_server');
    let savedEndpoint = localStorage.getItem('broadcaster_endpoint');
    if (savedServer) serverInput.value = savedServer;
    if (savedEndpoint) endpointInput.value = savedEndpoint;
    
    // Cargar paths activos.
    await actualizarPathsActivos();
    setCodecStatsMessage('Sin datos (inicia transmisión)');
});

// Manejar cambios de dispositivos.
videoSource.addEventListener('change', cambioDispositivo);

// Detectar conexiones o desconexiones de dispositivos.
navigator.mediaDevices.addEventListener('devicechange', actualizarDispositivos);

// Iniciar la previsualización al hacer clic en el vídeo.
preview.addEventListener('click', visualizarPreview);
