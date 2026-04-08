/**
 * UI DEL EMISOR WHIP - MEDIA MTX
 * Gestiona DOM, paths, dispositivos y estadísticas visuales.
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
let videoCodecPreference = document.getElementById('videoCodecPreference');

// Botones de control
let startBtn = document.getElementById('startBtn');
let stopBtn = document.getElementById('stopBtn');

// Player
let preview = document.getElementById('preview');
let liveIndicator = document.getElementById('liveIndicator');

// Estado global de UI
let activePaths = [];
let codecStatsWatchdog = null;
let watchdogAlertShown = false;
let availableVideoCodecFamilies = [];

const CODEC_STATS_INTERVAL_MS = 500;
const STALLED_BYTES_SENT_MAX_SAMPLES = 2;

const VIDEO_CODEC_EXCLUDES = new Set(['video/rtx', 'video/red', 'video/ulpfec']);

// CODECS VIDEO
/**
 * Devuelve la etiqueta legible para un códec de vídeo dado su MIME type.
 * @param {string} mimeType - MIME type del códec.
 * @returns {string}
 */
function getVideoCodecLabel(mimeType) {
    if (mimeType === 'video/h264') return 'H264';
    if (mimeType === 'video/h265' || mimeType === 'video/hevc') return 'H265 / HEVC';
    if (mimeType === 'video/vp8') return 'VP8';
    if (mimeType === 'video/vp9') return 'VP9';
    if (mimeType === 'video/av1') return 'AV1';

    let family = mimeType.split('/')[1] || mimeType;
    return family.toUpperCase();
}

/**
 * Rellena el selector de códec con los códecs de vídeo soportados por el navegador.
 */
function actualizarOpcionesCodecVideo() {
    if (!videoCodecPreference) return;

    let previousValue = localStorage.getItem('broadcaster_video_codec') || 'auto';
    let options = [{ value: 'auto', label: 'Automático' }];

    availableVideoCodecFamilies = [];

    if (typeof RTCRtpSender !== 'undefined' && typeof RTCRtpSender.getCapabilities === 'function') {
        let capabilities = RTCRtpSender.getCapabilities('video');
        if (capabilities && Array.isArray(capabilities.codecs)) {
            let seenFamilies = new Set();

            capabilities.codecs.forEach(codec => {
                let mimeType = (codec.mimeType || '').toLowerCase();
                if (!mimeType.startsWith('video/') || VIDEO_CODEC_EXCLUDES.has(mimeType)) return;

                let family = mimeType.split('/')[1] || mimeType;
                if (seenFamilies.has(family)) return;

                seenFamilies.add(family);
                availableVideoCodecFamilies.push(mimeType);

                let label = getVideoCodecLabel(mimeType);

                options.push({ value: mimeType, label });
            });
        }
    }

    videoCodecPreference.innerHTML = options
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');

    if (options.some(option => option.value === previousValue)) {
        videoCodecPreference.value = previousValue;
    } else {
        videoCodecPreference.value = 'auto';
    }
}

/**
 * Devuelve el códec de vídeo seleccionado por el usuario.
 * @returns {string}
 */
function getVideoCodecPreference() {
    return videoCodecPreference ? videoCodecPreference.value : 'auto';
}

/**
 * Guarda la preferencia de códec de vídeo.
 */
function guardarPreferenciaCodecVideo() {
    if (!videoCodecPreference) return;
    localStorage.setItem('broadcaster_video_codec', videoCodecPreference.value || 'auto');
}




// STATS RTP
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
 * Lee las estadísticas outbound-rtp y devuelve la suma de bytes enviados.
 * @returns {Promise<{monitorable: boolean, totalBytes: number}>}
 */
async function actualizarCodecStats() {
    if (!pc || !codecStatsEl) {
        return { monitorable: false, totalBytes: 0 };
    }

    try {
        let stats = await pc.getStats();
        let rows = [];
        let totalBytesSent = 0;

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

            totalBytesSent += typeof report.bytesSent === 'number' ? report.bytesSent : 0;
        });

        rows.sort((a, b) => a.kind.localeCompare(b.kind));
        renderCodecStats(rows);

        return {
            monitorable: rows.length > 0,
            totalBytes: totalBytesSent
        };
    } catch (error) {
        console.warn('No se pudieron leer estadísticas WebRTC:', error);
        if (codecStatsEl) {
            codecStatsEl.innerHTML = '<span class="error">Error leyendo estadísticas WebRTC</span>';
        }

        return { monitorable: false, totalBytes: 0 };
    }
}

/**
 * Inicia el refresco periódico de estadísticas WebRTC.
 */
function startCodecStatsPolling() {
    stopCodecStatsPolling();
    watchdogAlertShown = false;

    codecStatsWatchdog = createTrafficWatchdog({
        intervalMs: CODEC_STATS_INTERVAL_MS,
        maxStalledSamples: STALLED_BYTES_SENT_MAX_SAMPLES,
        sample: actualizarCodecStats,
        onStalled: () => {
            console.warn('bytesSent estancado, deteniendo transmisión');
            if (codecStatsEl) {
                codecStatsEl.innerHTML = '<span class="error">Sin envío RTP (bytesSent estancado)</span>';
            }
            if (!watchdogAlertShown) {
                watchdogAlertShown = true;
                alert('Transmisión detenida automáticamente: no se detecta envío de datos (bytesSent estancado).');
            }
            stopBroadcast();
        },
        onError: error => {
            console.warn('No se pudieron leer estadísticas WebRTC:', error);
            if (codecStatsEl) {
                codecStatsEl.innerHTML = '<span class="error">Error leyendo estadísticas WebRTC</span>';
            }
        }
    });

    codecStatsWatchdog.start();
}

/**
 * Devuelve una lista legible con las líneas relevantes del SDP de vídeo.
 * @param {string} sdp - SDP completo.
 * @returns {string}
 */
function extraerSeccionVideoSdp(sdp) {
    if (!sdp) return '';

    let lines = sdp.split(/\r?\n/);
    let collected = [];
    let inVideoSection = false;

    lines.forEach(line => {
        if (line.startsWith('m=video ')) {
            inVideoSection = true;
            collected.push(line);
            return;
        }

        if (line.startsWith('m=') && inVideoSection) {
            inVideoSection = false;
            return;
        }

        if (inVideoSection && (line.startsWith('a=rtpmap:') || line.startsWith('a=fmtp:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=mid:') || line.startsWith('a=extmap:'))) {
            collected.push(line);
        }
    });

    return collected.join('\n');
}

/**
 * Detiene el refresco periódico de estadísticas WebRTC.
 */
function stopCodecStatsPolling() {
    if (codecStatsWatchdog) {
        codecStatsWatchdog.stop();
        codecStatsWatchdog = null;
    }

    setCodecStatsMessage('Sin datos (inicia transmisión)');
}




// PATHS / ENDPOINTS
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
        let response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) throw new Error('API no disponible');

        let data = await response.json();
        activePaths = [];

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
        let devices = await navigator.mediaDevices.enumerateDevices();

        videoSource.innerHTML = '';
        audioSource.innerHTML = '';

        devices.forEach(device => {
            let option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} (${device.deviceId.slice(0, 8)}...)`;

            if (device.kind === 'videoinput') {
                videoSource.appendChild(option);
            } else if (device.kind === 'audioinput') {
                audioSource.appendChild(option);
            }
        });

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
    let [width, height] = resolution.value.split('x').map(Number);

    let constraints = {
        video: {
            deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: 30 }
        }
    };

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

/**
 * Cambia el dispositivo local si todavía no hay transmisión activa.
 */
async function cambioDispositivo() {
    if (localStream && !pc) {
        try {
            let newStream = await cogerStreamVideoAudioLocal();
            localStream.getTracks().forEach(track => track.stop());
            localStream = newStream;
            preview.srcObject = localStream;
        } catch (error) {
            mostrarError('No se pudo cambiar la cámara', error);
        }
    }
}




// UI
/**
 * Actualiza el estado visual del emisor.
 * @param {string} status - Clase visual a aplicar.
 * @param {string} text - Texto a mostrar.
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
        } catch (error) {
            mostrarError('No se pudo iniciar la previsualización', error);
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

document.addEventListener('DOMContentLoaded', async () => {
    await iniciarDispositivos();
    actualizarOpcionesCodecVideo();

    let savedServer = localStorage.getItem('broadcaster_server');
    let savedEndpoint = localStorage.getItem('broadcaster_endpoint');
    if (savedServer) serverInput.value = savedServer;
    if (savedEndpoint) endpointInput.value = savedEndpoint;

    await actualizarPathsActivos();
    setCodecStatsMessage('Sin datos (inicia transmisión)');
});

videoSource.addEventListener('change', cambioDispositivo);
if (videoCodecPreference) {
    videoCodecPreference.addEventListener('change', guardarPreferenciaCodecVideo);
}
navigator.mediaDevices.addEventListener('devicechange', actualizarDispositivos);
preview.addEventListener('click', visualizarPreview);