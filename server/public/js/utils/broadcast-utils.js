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
    let constraints;
    if (strictCheck.checked) {
        constraints = {
            video: {
                deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
                width: { strict: width },
                height: { strict: height },
                frameRate: { strict: 30 }
            }
    }
    }else {
        constraints = {
            video: {
                deviceId: videoSource.value ? { exact: videoSource.value } : undefined,
                width: { ideal: width },
                height: { ideal: height },
                frameRate: { ideal: 30 }
            }
    }
    };
    console.log('Solicitando stream con constraints:', constraints);
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