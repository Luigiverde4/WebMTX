/**
 * UTILIDADES DEL EMISOR: dispositivos, captura y ajustes persistentes.
 */

const CLAVE_AJUSTES_EMISOR = 'broadcaster_ajustes';

/**
 * Normaliza un nombre de endpoint a algo válido para MediaMTX:
 * minúsculas, sin acentos ni espacios; solo [a-z0-9_-].
 * @param {string} texto
 * @returns {string}
 */
function sanitizarEndpoint(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Ajustes del emisor guardados en localStorage.
 * @returns {object|null} null si nunca se han guardado (primera visita con esta versión)
 */
function leerAjustesEmisor() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_AJUSTES_EMISOR) || 'null');
    } catch {
        return null;
    }
}

function guardarAjustesEmisor(ajustes) {
    try {
        localStorage.setItem(CLAVE_AJUSTES_EMISOR, JSON.stringify(ajustes));
    } catch (error) {
        console.warn('No se pudieron guardar los ajustes del emisor:', error);
    }
}

// DISPOSITIVOS AUDIOVISUALES
/**
 * Solicita permisos y carga la lista real de dispositivos.
 */
async function iniciarDispositivos() {
    // Primero lo que se pueda listar sin permiso (sin nombres), luego con permiso
    await actualizarDispositivos();
    try {
        let tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
        tempStream.getTracks().forEach(track => track.stop());
    } catch (error) {
        mostrarError('No hay permiso para usar la cámara', error);
    }
    await actualizarDispositivos();
}

/**
 * Rellena los selectores con las cámaras y micrófonos disponibles,
 * conservando la selección actual o la guardada.
 */
async function actualizarDispositivos() {
    try {
        let devices = await navigator.mediaDevices.enumerateDevices();
        let ajustes = leerAjustesEmisor() || {};
        let videoPrevio = videoSource.value || ajustes.camara;
        let audioPrevio = audioSource.value || ajustes.micro;

        videoSource.innerHTML = '';
        audioSource.innerHTML = '';

        let numVideo = 0;
        let numAudio = 0;
        devices.forEach(device => {
            let option = document.createElement('option');
            option.value = device.deviceId;

            if (device.kind === 'videoinput') {
                numVideo += 1;
                option.text = device.label || `Cámara ${numVideo}`;
                videoSource.appendChild(option);
            } else if (device.kind === 'audioinput') {
                numAudio += 1;
                option.text = device.label || `Micrófono ${numAudio}`;
                audioSource.appendChild(option);
            }
        });

        let noAudioOption = document.createElement('option');
        noAudioOption.value = 'none';
        noAudioOption.text = 'Sin micrófono';
        audioSource.appendChild(noAudioOption);

        if (!numVideo) {
            let vacio = document.createElement('option');
            vacio.value = '';
            vacio.text = 'No se encontró ninguna cámara';
            videoSource.appendChild(vacio);
        }

        if (videoPrevio && [...videoSource.options].some(o => o.value === videoPrevio)) videoSource.value = videoPrevio;
        if (audioPrevio && [...audioSource.options].some(o => o.value === audioPrevio)) audioSource.value = audioPrevio;

        console.log('Dispositivos actualizados');
    } catch (error) {
        mostrarError('No se pudieron enumerar los dispositivos', error);
    }
}

/**
 * Constraints de getUserMedia según la configuración de la UI.
 * @param {boolean} exacta - true pide resolución exacta; false, la más cercana (ideal).
 */
function construirConstraints(exacta) {
    let [width, height] = resolution.value.split('x').map(Number);
    let fps = Number(frameRateSelect.value) || 30;
    let modo = exacta ? 'exact' : 'ideal';

    let constraints = {
        video: {
            deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
            width: { [modo]: width },
            height: { [modo]: height },
            frameRate: { ideal: fps, max: fps }
        }
    };

    if (audioSource.value !== 'none') {
        constraints.audio = {
            deviceId: audioSource.value ? { exact: audioSource.value } : undefined,
            echoCancellation: echoCancellationCheck.checked,
            noiseSuppression: noiseSuppressionCheck.checked,
            autoGainControl: autoGainControlCheck.checked,
            channelCount: { ideal: 2 },
            sampleRate: { ideal: 48000 }
        };
    } else {
        constraints.audio = false;
    }
    return constraints;
}

/**
 * Obtiene un stream local según la configuración elegida: primero con la
 * resolución exacta y, si la cámara no la admite, con la más cercana.
 */
async function cogerStreamVideoAudioLocal() {
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia(construirConstraints(true));
    } catch (error) {
        if (error && (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError')) {
            console.warn('La cámara no admite la resolución exacta; se pide la más cercana');
            stream = await navigator.mediaDevices.getUserMedia(construirConstraints(false));
        } else {
            throw error;
        }
    }

    let pistaVideo = stream.getVideoTracks()[0];
    if (pistaVideo) {
        pistaVideo.contentHint = contentHintSelect.value || 'detail';
        ajustarOpcionesSegunCapacidades(pistaVideo);
    }
    mostrarAplicado(stream);
    return stream;
}

/**
 * Deshabilita resoluciones y fps que la cámara no puede dar.
 * @param {MediaStreamTrack} pistaVideo
 */
function ajustarOpcionesSegunCapacidades(pistaVideo) {
    if (typeof pistaVideo.getCapabilities !== 'function') return;
    let capacidades = pistaVideo.getCapabilities();
    let maxAncho = capacidades.width?.max;
    let maxAlto = capacidades.height?.max;
    let maxFps = capacidades.frameRate?.max;

    [...resolution.options].forEach(opcion => {
        let [w, h] = opcion.value.split('x').map(Number);
        let cabe = !maxAncho || !maxAlto || (w <= maxAncho && h <= maxAlto);
        opcion.disabled = !cabe;
        opcion.textContent = opcion.textContent.replace(/ \(no disponible\)$/, '') + (cabe ? '' : ' (no disponible)');
    });
    [...frameRateSelect.options].forEach(opcion => {
        let cabe = !maxFps || Number(opcion.value) <= Math.round(maxFps);
        opcion.disabled = !cabe;
    });
}

/**
 * Cambia el dispositivo o la captura local si todavía no hay transmisión activa.
 */
async function cambioDispositivo() {
    guardarAjustesDesdeUi();
    // Solo se reabre la cámara en previsualización; en emisión se aplica al volver a emitir
    if (estadoEmision !== ESTADOS_EMISION.PREVISUALIZANDO || !localStream) return;
    try {
        localStream.getTracks().forEach(track => track.stop());
        localStream = await cogerStreamVideoAudioLocal();
        preview.srcObject = localStream;
    } catch (error) {
        localStream = null;
        preview.srcObject = null;
        actualizarVacioPreview();
        mostrarError('No se pudo abrir la cámara con esa configuración', error);
        cambiarEstadoEmision(ESTADOS_EMISION.ERROR, { mensaje: 'No se pudo abrir la cámara' });
    }
}
