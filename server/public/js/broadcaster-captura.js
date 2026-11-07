/**
 * CAMBIOS DE CAPTURA DURANTE LA EMISIÓN (sin cortar)
 * WebRTC deja cambiar la pista que se envía sin renegociar la conexión
 * (RTCRtpSender.replaceTrack) y reconfigurar la cámara abierta
 * (MediaStreamTrack.applyConstraints). Así, emitiendo, cámara, resolución,
 * fps, micro y procesado se aplican al momento: los visores solo ven el
 * cambio de imagen. Solo el códec, el nombre y pasar de "Sin micrófono" a un
 * micro piden volver a emitir (cambian la propia conexión).
 *
 * Base de comparación: capturaAbiertaCon (js/utils/broadcast-utils.js), los
 * ajustes con los que se abrió lo que está saliendo ahora.
 */

/** Emisor de la conexión para 'video' o 'audio' (aunque su pista esté vacía). */
function emisorDe(tipo) {
    if (!pc) return null;
    let transceptor = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === tipo);
    return transceptor ? transceptor.sender : null;
}

/** Sustituye la pista local de un tipo y la que se envía. */
async function sustituirPista(tipo, nueva) {
    let emisor = emisorDe(tipo);
    if (emisor) await emisor.replaceTrack(nueva);
    let resto = localStream ? localStream.getTracks().filter(t => t.kind !== tipo) : [];
    let viejas = localStream ? localStream.getTracks().filter(t => t.kind === tipo) : [];
    localStream = new MediaStream(nueva ? [nueva, ...resto] : resto);
    preview.srcObject = localStream;
    viejas.filter(t => t !== nueva).forEach(t => t.stop());
}

/** ¿Se emitió sin micro y ahora se pide uno (o al revés)? Eso sí renegocia. */
function cambiaPresenciaMicro(antes, ahora) {
    return (antes.micro === 'none') !== (ahora.micro === 'none');
}

/**
 * Aplica en la emisión lo que haya cambiado en Captura respecto a lo que sale.
 */
async function cambiarCapturaEnDirecto() {
    let antes = capturaAbiertaCon;
    if (!antes || !pc) return;
    let ahora = leerAjustesDeReconexion();

    if (ahora.camara !== antes.camara) {
        await cambiarCamaraEnDirecto(antes);
    } else if (ahora.resolucion !== antes.resolucion || ahora.fps !== antes.fps) {
        await cambiarFormatoEnDirecto(antes);
    }

    let cambiaAudio = ['micro', 'eco', 'ruido', 'ganancia'].some(clave => ahora[clave] !== antes[clave]);
    if (cambiaAudio && !cambiaPresenciaMicro(antes, ahora)) {
        await cambiarMicroEnDirecto(antes);
    }
}

/** Tras cambiar el vídeo que sale: lo que lo describe y el tope de fps del codificador. */
async function despuesDeCambiarVideo(pista) {
    capturaAbiertaCon = { ...capturaAbiertaCon, camara: videoSource.value, resolucion: resolution.value, fps: frameRateSelect.value };
    ajustarOpcionesSegunCapacidades(pista);
    mostrarAplicado(localStream);
    await configurarCalidadVideo(pc); // maxFramerate sigue a los fps elegidos
}

/** Vuelve a dejar en la UI lo que está saliendo y explica por qué. */
function deshacerCambioCaptura(antes, error, que) {
    console.error(`No se pudo cambiar ${que} en directo:`, error);
    ponerAjustesDeCaptura(antes);
    guardarAjustesDesdeUi();
    mostrarAviso(`No se pudo cambiar ${que}: la cámara ${motivoFalloCamara(error)}. Sigue saliendo lo anterior.`, 'aviso');
}

/**
 * Otra cámara: se abre la nueva sin cerrar la que sale y se pasa la emisión
 * a ella. Si no abre, no se toca nada de lo que sale.
 */
async function cambiarCamaraEnDirecto(antes) {
    let nueva;
    try {
        nueva = await abrirPistaVideo();
    } catch (error) {
        deshacerCambioCaptura(antes, error, 'de cámara');
        return;
    }
    if (!ESTADOS_EN_DIRECTO.has(estadoEmision)) { nueva.stop(); return; }
    await sustituirPista('video', nueva);
    await despuesDeCambiarVideo(nueva);
    mostrarAviso(`Ahora sale ${nueva.label || 'la nueva cámara'}`, 'ok', 2000);
}

/**
 * Misma cámara, otra resolución o fps: se reconfigura la cámara abierta. Si
 * el navegador no deja (algunas cámaras), se reabre y se sustituye.
 */
async function cambiarFormatoEnDirecto(antes) {
    let pista = localStream && localStream.getVideoTracks()[0];
    if (!pista) return;
    try {
        try {
            await pista.applyConstraints(constraintsFormatoVideo(true));
        } catch (error) {
            if (!esFalloDeFormato(error)) throw error;
            await pista.applyConstraints(constraintsFormatoVideo(false)); // la más cercana
        }
        await despuesDeCambiarVideo(pista);
    } catch (error) {
        // Último recurso: cerrar y reabrir la misma cámara con el formato nuevo
        console.warn('applyConstraints no pudo; se reabre la cámara:', error);
        try {
            pista.stop();
            let nueva = await abrirPistaVideo();
            await sustituirPista('video', nueva);
            await despuesDeCambiarVideo(nueva);
        } catch (errorReapertura) {
            // Volver a lo que salía
            ponerAjustesDeCaptura(antes);
            try {
                let anterior = await abrirPistaVideo();
                await sustituirPista('video', anterior);
                await despuesDeCambiarVideo(anterior);
            } catch (errorAnterior) {
                console.error('Tampoco se pudo volver al formato anterior:', errorAnterior);
            }
            deshacerCambioCaptura(antes, errorReapertura, 'la resolución o los fps');
        }
    }
}

/**
 * Otro micro u otro procesado: se abre el nuevo (si el micro no deja abrirse
 * dos veces, se suelta antes el que sale) y se sustituye. "Sin micrófono"
 * envía silencio sin cerrar la conexión.
 */
async function cambiarMicroEnDirecto(antes) {
    if (audioSource.value === 'none') {
        await sustituirPista('audio', null);
        capturaAbiertaCon = { ...capturaAbiertaCon, micro: 'none' };
        return;
    }
    let anterior = localStream && localStream.getAudioTracks()[0];
    let nueva;
    try {
        try {
            nueva = await abrirPistaAudio();
        } catch (error) {
            if (!anterior) throw error;
            anterior.stop(); // algunos micros no se dejan abrir dos veces
            nueva = await abrirPistaAudio();
        }
    } catch (error) {
        ponerAjustesDeCaptura(antes);
        if (anterior && anterior.readyState === 'ended') {
            try { nueva = await abrirPistaAudio(); } catch { nueva = null; }
            if (nueva) await sustituirPista('audio', nueva);
        }
        guardarAjustesDesdeUi();
        console.error('No se pudo cambiar el micro en directo:', error);
        mostrarAviso(`No se pudo cambiar el micrófono: ${motivoFalloCamara(error, false)}. Sigue el anterior.`, 'aviso');
        return;
    }
    await sustituirPista('audio', nueva);
    capturaAbiertaCon = {
        ...capturaAbiertaCon,
        micro: audioSource.value,
        eco: echoCancellationCheck.checked,
        ruido: noiseSuppressionCheck.checked,
        ganancia: autoGainControlCheck.checked
    };
}
