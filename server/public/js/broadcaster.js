/**
 * EMISOR WHIP - MEDIA MTX
 * Gestiona exclusivamente la publicación WebRTC hacia el servidor.
 */

// Recursos de la emisión. En qué punto está la emisión NO se deduce de ellos:
// lo dice estadoEmision (js/utils/estado-emision.js).
let pc = null;
let localStream = null;
let whipSession = null;
// Cada intento de emisión tiene un número; si se cancela o empieza otro, los
// awaits del intento anterior lo detectan y se desentienden.
let intentoEmision = 0;

/**
 * Aplica la preferencia de códec de vídeo elegida en la UI si el navegador la soporta.
 * @param {RTCPeerConnection} pcConnection - Conexión en negociación.
 * @param {string} preferredCodec - MIME type preferido, o "auto" para no forzar nada.
 */
function aplicarCodecVideoPreferido(pcConnection, preferredCodec) {
    if (!pcConnection || !preferredCodec || preferredCodec === 'auto' || typeof RTCRtpSender === 'undefined' || typeof RTCRtpSender.getCapabilities !== 'function') {
        return;
    }

    let capabilities = RTCRtpSender.getCapabilities('video');
    if (!capabilities || !Array.isArray(capabilities.codecs)) {
        return;
    }

    let selectedMimeType = preferredCodec.toLowerCase();
    let selectedCodecs = capabilities.codecs.filter(codec => (codec.mimeType || '').toLowerCase() === selectedMimeType);

    if (selectedCodecs.length === 0) {
        console.warn(`El códec ${selectedMimeType} no está disponible en este navegador; se usará el códec por defecto`);
        return;
    }

    let transceivers = typeof pcConnection.getTransceivers === 'function' ? pcConnection.getTransceivers() : [];
    transceivers.forEach(transceiver => {
        if (!transceiver.sender || !transceiver.sender.track || transceiver.sender.track.kind !== 'video') {
            return;
        }

        if (typeof transceiver.setCodecPreferences === 'function') {
            transceiver.setCodecPreferences(selectedCodecs);
            console.log('Preferencia de códec aplicada:', selectedMimeType);
        }
    });
}

/**
 * Aplica los parámetros de codificación de la UI a los senders de una conexión:
 * bitrate de vídeo, escala de resolución enviada, preferencia de degradación y
 * bitrate de audio. Se puede llamar en cualquier momento: con la emisión en
 * marcha se aplica sin renegociar.
 *
 * No se usa track.contentHint: con "detail" o "text" Chrome trata la cámara
 * como una captura de pantalla y nunca baja la resolución, sea cual sea
 * degradationPreference (medido: 1080p a 10 fps con las tres opciones). Sin
 * hint, la preferencia funciona: a 0,8 Mbps, mantener fotogramas da 480×270 a
 * 27 fps; mantener resolución, 1080p a 10 fps; equilibrar, 640×360 a 13 fps.
 * @param {RTCPeerConnection} pcConnection
 */
async function configurarCalidadVideo(pcConnection) {
    let senders = pcConnection && typeof pcConnection.getSenders === 'function' ? pcConnection.getSenders() : [];

    for (let sender of senders) {
        if (!sender.track) continue;
        let params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }

        if (sender.track.kind === 'video') {
            params.encodings[0].maxBitrate = cogerBitrateVideo();
            params.encodings[0].scaleResolutionDownBy = Number(escalaEnvioSelect.value) || 1;
            params.encodings[0].maxFramerate = Number(frameRateSelect.value) || 30;
            params.degradationPreference = degradacionSelect.value || 'maintain-resolution';
        } else if (sender.track.kind === 'audio') {
            params.encodings[0].maxBitrate = Number(audioBitrateSelect.value) || 128000;
        }

        try {
            await sender.setParameters(params);
        } catch (error) {
            // Algún navegador no admite degradationPreference: se reintenta sin ella
            if (sender.track.kind === 'video' && 'degradationPreference' in params) {
                delete params.degradationPreference;
                try {
                    await sender.setParameters(params);
                } catch (errorReintento) {
                    console.warn('No se pudo aplicar la calidad de vídeo:', errorReintento);
                }
            } else {
                console.warn(`No se pudo aplicar la configuración de ${sender.track.kind}:`, error);
            }
        }
    }
    console.log('Calidad aplicada', {
        videoBps: cogerBitrateVideo(),
        escala: escalaEnvioSelect.value,
        degradacion: degradacionSelect.value,
        audioBps: audioBitrateSelect.value
    });
}

/**
 * Reaplica los ajustes "en directo" sobre la emisión en curso (si la hay).
 */
async function aplicarAjustesEnDirecto() {
    if (!pc) return;
    await configurarCalidadVideo(pc);
    mostrarAviso('Ajustes aplicados en directo', 'ok', 1800);
}

/**
 * Botón principal: emite o, si hay ajustes nuevos durante la emisión, vuelve a emitir.
 */
function pulsarEmitir() {
    if (hayCambiosPendientes()) return volverAEmitir();
    return startBroadcast();
}

/**
 * Aplica los ajustes que solo valen al reconectar: corta y vuelve a emitir
 * enseguida. Los espectadores se reenganchan solos (player y neoplayer reconectan).
 */
async function volverAEmitir() {
    let endpointAnterior = ajustesEmitidos ? ajustesEmitidos.endpoint : null;
    await stopBroadcast();
    // Sin confirmar "ya hay alguien emitiendo": ese alguien éramos nosotros hace un instante
    await startBroadcast({ reemisionDe: endpointAnterior });
}

/**
 * Inicia la publicación WHIP del stream local.
 * @param {{reemisionDe?: string}} [opciones] - En una reemisión, endpoint que se acaba de dejar.
 */
async function startBroadcast(opciones = {}) {
    let endpoint = sanitizarEndpoint(endpointInput.value);
    endpointInput.value = endpoint; // Reflejar en el campo lo que realmente se usará
    marcarEndpointElegido();
    let server = serverInput.value.trim();

    console.log('[broadcaster] startBroadcast()', { endpoint, server });

    if (!endpoint) {
        mostrarAviso('Escribe un nombre para la cámara (por ejemplo cam1 o movil).', 'aviso');
        endpointInput.focus();
        return;
    }

    if (!server) {
        mostrarAviso('Falta la dirección del servidor (Destino > Servidor).', 'aviso');
        serverInput.focus();
        return;
    }

    await actualizarPathsActivos(true);
    if (esPathActivo(endpoint) && opciones.reemisionDe !== endpoint) {
        let continuar = await confirmar(
            `Ya hay alguien emitiendo como "${endpoint}". Si continúas, tu emisión lo reemplazará.`,
            { aceptar: 'Reemplazar y emitir', peligro: true }
        );
        if (!continuar) return;
    }

    localStorage.setItem('broadcaster_server', server);
    localStorage.setItem('broadcaster_endpoint', endpoint);
    guardarAjustesDesdeUi();

    // Mientras se esperaba la confirmación pudo empezar otra emisión
    if (!cambiarEstadoEmision(ESTADOS_EMISION.ABRIENDO)) return;
    fijarAjustesEmitidos(); // foto de lo que se emite: base de "Volver a emitir"

    let intento = ++intentoEmision;
    let cancelado = () => intento !== intentoEmision;

    let conexion = null;

    try {
        console.log('[broadcaster] solicitando stream local');
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        let stream = await cogerStreamVideoAudioLocal();
        if (cancelado()) { // Se canceló mientras se abría la cámara
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        localStream = stream;
        preview.srcObject = localStream;
        actualizarVacioPreview();

        cambiarEstadoEmision(ESTADOS_EMISION.NEGOCIANDO);
        console.log('[broadcaster] creando RTCPeerConnection');
        conexion = new RTCPeerConnection();
        pc = conexion;

        localStream.getTracks().forEach(track => {
            console.log('Añadiendo track:', track.kind);
            conexion.addTrack(track, localStream);
        });

        aplicarCodecVideoPreferido(conexion, cogerVideoCodecPreferencia());
        await configurarCalidadVideo(conexion);

        conexion.oniceconnectionstatechange = () => {
            if (pc !== conexion) return; // Conexión ya reemplazada o cerrada
            let estadoIce = conexion.iceConnectionState;
            console.log('ICE state:', estadoIce);

            // El margen de gracia lo gestiona el estado 'inestable' (estado-emision.js)
            if (estadoIce === 'connected' || estadoIce === 'completed') {
                recuperarDeInestable();
            } else if (estadoIce === 'disconnected') {
                cambiarEstadoEmision(ESTADOS_EMISION.INESTABLE);
            } else if (estadoIce === 'failed' || estadoIce === 'closed') {
                mostrarAviso('Emisión detenida: la conexión WebRTC falló.', 'error');
                stopBroadcast({ error: 'La conexión WebRTC falló' });
            }
        };

        let offer = await conexion.createOffer();
        await conexion.setLocalDescription(offer);
        await esperarICEcompleto(conexion);
        if (cancelado()) return; // Se canceló mientras recopilábamos ICE

        let whipUrl = `${construirBaseUrlWebRTC(server)}/${encodeURIComponent(endpoint)}/whip`;
        console.log('WHIP URL:', whipUrl);

        let response = await fetch(whipUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp'
            },
            body: conexion.localDescription.sdp
        });

        // MediaMTX devuelve Location relativo (/cam1/whip/<id>): se resuelve contra la URL de WHIP
        let location = response.headers.get('Location');
        let sesion = location ? new URL(location, whipUrl).toString() : null;

        if (cancelado()) { // Se canceló durante el intercambio SDP: cerrar la sesión recién creada
            if (sesion) fetch(sesion, { method: 'DELETE' }).catch(() => {});
            return;
        }

        if (!response.ok) {
            let detalle = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status} ${response.statusText} ${detalle}`.trim());
        }

        whipSession = sesion;
        console.log('WHIP Session:', whipSession);

        let answerSDP = await response.text();
        await conexion.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));

        // Si ICE ya se cortó, 'inestable' recordará volver aquí al recuperarse
        if (estadoEmision === ESTADOS_EMISION.NEGOCIANDO) cambiarEstadoEmision(ESTADOS_EMISION.ESPERANDO_TRAFICO);
        else if (estadoEmision === ESTADOS_EMISION.INESTABLE) estadoPrevioInestable = ESTADOS_EMISION.ESPERANDO_TRAFICO;

        await esperarStreamSaliente(conexion);
        if (cancelado()) return; // Se canceló esperando tráfico saliente

        if (estadoEmision === ESTADOS_EMISION.ESPERANDO_TRAFICO) cambiarEstadoEmision(ESTADOS_EMISION.EN_DIRECTO);
        else if (estadoEmision === ESTADOS_EMISION.INESTABLE) estadoPrevioInestable = ESTADOS_EMISION.EN_DIRECTO;
        startCodecStatsPolling();
        console.log('Transmisión WHIP iniciada correctamente');
    } catch (error) {
        // Solo reportar si el fallo es del intento vigente (no de uno cancelado)
        if (!cancelado()) {
            mostrarError('No se pudo empezar a emitir', error);
            await stopBroadcast({ error: 'No se pudo empezar a emitir' });
        }
    }

    setTimeout(() => actualizarPathsActivos(true), 1000);
}

/**
 * Detiene la transmisión (o cancela la conexión en curso) y libera recursos locales.
 * @param {{error?: string}} [opciones] - Con error, termina en 'error' en vez de 'inactivo'.
 */
async function stopBroadcast(opciones = {}) {
    // Solo hay algo que detener mientras se emite o se conecta; esto también
    // evita paradas dobles (el estado 'deteniendo' no admite volver a entrar).
    if (!cambiarEstadoEmision(ESTADOS_EMISION.DETENIENDO)) return;
    intentoEmision += 1; // Invalida cualquier intento en curso
    olvidarAjustesEmitidos();

    console.log('[broadcaster] stopBroadcast()', {
        hasSession: Boolean(whipSession),
        hasPeerConnection: Boolean(pc),
        hasLocalStream: Boolean(localStream)
    });

    stopCodecStatsPolling();

    let sesion = whipSession;
    whipSession = null;
    if (pc) {
        pc.close();
        pc = null;
    }

    if (sesion) {
        try {
            await fetch(sesion, { method: 'DELETE' });
        } catch (error) {
            console.warn('No se pudo cerrar la sesión WHIP (MediaMTX la cerrará por timeout):', error);
        }
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    preview.srcObject = null;
    actualizarVacioPreview();
    mostrarAplicado(null);

    if (opciones.error) {
        cambiarEstadoEmision(ESTADOS_EMISION.ERROR, { mensaje: opciones.error });
    } else {
        cambiarEstadoEmision(ESTADOS_EMISION.INACTIVO);
    }

    console.log('Transmisión detenida');
    setTimeout(() => actualizarPathsActivos(true), 1000);
}

/**
 * Espera hasta que termine la recopilación de ICE candidates.
 * @param {RTCPeerConnection} pcConnection - Conexión en negociación.
 */
function esperarICEcompleto(pcConnection) {
    return new Promise(resolve => {
        if (pcConnection.iceGatheringState === 'complete') {
            resolve();
            return;
        }

        let checkState = () => {
            if (pcConnection.iceGatheringState === 'complete') {
                pcConnection.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }
        };

        pcConnection.addEventListener('icegatheringstatechange', checkState);
        setTimeout(resolve, 5000);
    });
}

/**
 * Espera a que el peer connection empiece a enviar tráfico real.
 * Tolerante: si en 10 s no se confirma, continúa igualmente (el watchdog vigila después).
 * @param {RTCPeerConnection} pcConnection - Conexión en negociación.
 */
function esperarStreamSaliente(pcConnection) {
    return new Promise((resolve, reject) => {
        let finished = false;
        let timeoutId = null;

        let finish = (callback, value) => {
            if (finished) return;
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            callback(value);
        };

        let checkStats = async () => {
            if (finished) return;

            if (!pcConnection || pcConnection.connectionState === 'closed' || pcConnection.iceConnectionState === 'closed') {
                finish(reject, new Error('La conexión se cerró antes de confirmar el envío del stream'));
                return;
            }

            try {
                let stats = await pcConnection.getStats();
                let hasOutgoingTraffic = false;

                stats.forEach(report => {
                    if (report.type !== 'outbound-rtp' || report.isRemote) return;
                    if (typeof report.bytesSent === 'number' && report.bytesSent > 0) {
                        hasOutgoingTraffic = true;
                    }
                });

                if (hasOutgoingTraffic) {
                    console.log('[broadcaster] esperarStreamSaliente: tráfico saliente confirmado');
                    finish(resolve);
                    return;
                }

                setTimeout(checkStats, 300);
            } catch (error) {
                finish(reject, error);
            }
        };

        timeoutId = setTimeout(() => {
            if (!finished) {
                console.warn('No se pudo confirmar el envío del stream en el tiempo esperado; se continúa con la emisión');
                finish(resolve);
            }
        }, 10000);

        checkStats();
    });
}

// Al cerrar la pestaña, liberar la sesión en el servidor
window.addEventListener('pagehide', () => {
    if (whipSession) {
        fetch(whipSession, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
});
