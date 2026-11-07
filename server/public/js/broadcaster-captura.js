/**
 * CAMBIOS DE CAPTURA DURANTE LA EMISIÓN (sin cortar)
 * WebRTC deja cambiar la pista que se envía sin renegociar la conexión
 * (RTCRtpSender.replaceTrack) y reconfigurar la cámara abierta
 * (MediaStreamTrack.applyConstraints). Así, emitiendo, resolución, fps, micro
 * y procesado se aplican al momento: los visores solo ven el cambio de imagen.
 * Otra cámara va antes a un PREVIO (monitor pequeño, verde) y sale con "Pasar
 * a directo", como en una mesa de realización. Solo el códec, el nombre y
 * pasar de "Sin micrófono" a un micro piden volver a emitir (cambian la
 * propia conexión).
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

// PREVIO: otra cámara abierta y a la vista, aún sin salir.
// { pista, ajustes: { camara, resolucion, fps } } o null.
let previo = null;

/**
 * Aplica en la emisión lo que haya cambiado en Captura respecto a lo que sale.
 * Otra cámara no sale directamente: va al previo hasta "Pasar a directo".
 */
async function cambiarCapturaEnDirecto() {
    let antes = capturaAbiertaCon;
    if (!antes || !pc) return;
    let ahora = leerAjustesDeReconexion();
    let enPrevio = previo ? previo.ajustes : null;

    if (ahora.camara !== (enPrevio ? enPrevio.camara : antes.camara)) {
        if (ahora.camara === antes.camara) {
            // Se volvió a elegir la cámara que sale: el previo sobra
            cerrarPrevio();
            ajustarOpcionesSegunCapacidades(localStream.getVideoTracks()[0]);
            if (ahora.resolucion !== antes.resolucion || ahora.fps !== antes.fps) await cambiarFormatoEnDirecto(antes);
        } else {
            await abrirPrevio(enPrevio || antes);
        }
    } else if (enPrevio && (ahora.resolucion !== enPrevio.resolucion || ahora.fps !== enPrevio.fps)) {
        await cambiarFormatoPrevio();
    } else if (!enPrevio && (ahora.resolucion !== antes.resolucion || ahora.fps !== antes.fps)) {
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
 * Otra cámara: se abre en el previo, sin tocar lo que sale. Si no abre, los
 * selectores vuelven a lo que había (el previo anterior o el programa).
 * @param {object} base - Ajustes a los que volver si falla.
 */
async function abrirPrevio(base) {
    let nueva;
    try {
        nueva = await abrirPistaVideo();
    } catch (error) {
        deshacerCambioCaptura(base, error, 'de cámara');
        return;
    }
    if (!ESTADOS_EN_DIRECTO.has(estadoEmision)) { nueva.stop(); return; }
    if (previo) previo.pista.stop();
    previo = { pista: nueva, ajustes: { camara: videoSource.value, resolucion: resolution.value, fps: frameRateSelect.value } };
    ajustarOpcionesSegunCapacidades(nueva);
    pintarPrevio(nueva);
}

/** Otra resolución o fps con el previo abierto: se aplican al previo, no a lo que sale. */
async function cambiarFormatoPrevio() {
    let pista = previo.pista;
    try {
        try {
            await pista.applyConstraints(constraintsFormatoVideo(true));
        } catch (error) {
            if (!esFalloDeFormato(error)) throw error;
            await pista.applyConstraints(constraintsFormatoVideo(false));
        }
    } catch {
        // Reabrir la cámara del previo con el formato nuevo
        pista.stop();
        try {
            pista = await abrirPistaVideo();
        } catch (error) {
            let base = { ...capturaAbiertaCon, ...previo.ajustes };
            cerrarPrevio();
            deshacerCambioCaptura(base, error, 'la resolución o los fps del previo');
            return;
        }
        previo.pista = pista;
    }
    previo.ajustes = { ...previo.ajustes, resolucion: resolution.value, fps: frameRateSelect.value };
    pintarPrevio(pista);
}

/** La cámara del previo pasa a salir, sin cortar la emisión. */
async function pasarPrevioADirecto(evento) {
    if (evento) evento.stopPropagation();
    if (!previo || !ESTADOS_EN_DIRECTO.has(estadoEmision)) return;
    let { pista, ajustes } = previo;
    previo = null;
    pintarPrevio(null);
    await sustituirPista('video', pista);
    capturaAbiertaCon = { ...capturaAbiertaCon, ...ajustes };
    await despuesDeCambiarVideo(pista);
}

/** Cierra el previo y los selectores vuelven a lo que sale. */
function descartarPrevio(evento) {
    if (evento) evento.stopPropagation();
    if (!previo) return;
    cerrarPrevio();
    if (capturaAbiertaCon) {
        ponerAjustesDeCaptura({ ...leerAjustesDeReconexion(), camara: capturaAbiertaCon.camara, resolucion: capturaAbiertaCon.resolucion, fps: capturaAbiertaCon.fps });
        guardarAjustesDesdeUi();
    }
    let pista = localStream && localStream.getVideoTracks()[0];
    if (pista) ajustarOpcionesSegunCapacidades(pista);
}

/** Suelta el previo sin tocar los selectores (al detener o volver a emitir). */
function cerrarPrevio() {
    if (!previo) return;
    previo.pista.stop();
    previo = null;
    pintarPrevio(null);
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
