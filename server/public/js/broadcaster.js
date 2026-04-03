/**
 * EMISOR WHIP - MEDIA MTX
 * Gestiona exclusivamente la publicación WebRTC hacia el servidor.
 */

// Estado global de emisión
let pc = null;
let localStream = null;
let whipSession = null;
let isStoppingBroadcast = false;

/**
 * Inicia la publicación WHIP del stream local.
 */
async function startBroadcast() {
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

    await actualizarPathsActivos();
    if (esPathActivo(endpoint)) {
        let continuar = confirm(`⚠️ El endpoint "${endpoint}" ya está en uso.\n\n¿Quieres continuar de todos modos? (Podría reemplazar el stream existente)`);
        if (!continuar) return;
    }

    localStorage.setItem('broadcaster_server', server);
    localStorage.setItem('broadcaster_endpoint', endpoint);

    updateStatus('connecting', 'Conectando...');
    startBtn.disabled = true;

    try {
        localStream = await cogerStreamVideoAudioLocal();
        preview.srcObject = localStream;

        pc = new RTCPeerConnection();

        localStream.getTracks().forEach(track => {
            console.log('Añadiendo track:', track.kind);
            pc.addTrack(track, localStream);
        });

        pc.onicecandidate = event => {
            if (event.candidate) {
                console.log('ICE candidate:', event.candidate.candidate);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE state:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                updateStatus('connecting', 'Conectado, verificando emisión...');
            } else if (
                pc.iceConnectionState === 'disconnected' ||
                pc.iceConnectionState === 'failed' ||
                pc.iceConnectionState === 'closed'
            ) {
                stopBroadcast();
            }
        };

        let offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await waitForIceGathering(pc);

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

        whipSession = response.headers.get('Location');
        console.log('WHIP Session:', whipSession);

        let answerSDP = await response.text();
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: answerSDP
        }));

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

    setTimeout(actualizarPathsActivos, 1000);
}

/**
 * Detiene la transmisión y libera recursos locales.
 */
async function stopBroadcast() {
    if (isStoppingBroadcast) return;
    isStoppingBroadcast = true;

    stopCodecStatsPolling();

    if (whipSession) {
        try {
            await fetch(whipSession, { method: 'DELETE' });
        } catch (error) {
            mostrarError('No se pudo cerrar la sesión WHIP', error);
        }
        whipSession = null;
    }

    if (pc) {
        pc.close();
        pc = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    preview.srcObject = null;
    liveIndicator.style.display = 'none';
    updateStatus('disconnected', 'Sin transmitir');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    streamUrlEl.textContent = '-';

    console.log('Transmisión detenida');
    setTimeout(actualizarPathsActivos, 1000);
    isStoppingBroadcast = false;
}

/**
 * Espera hasta que termine la recopilación de ICE candidates.
 * @param {RTCPeerConnection} pcConnection - Conexión en negociación.
 */
function waitForIceGathering(pcConnection) {
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
 * @param {RTCPeerConnection} pcConnection - Conexión en negociación.
 */
function waitForOutgoingStream(pcConnection) {
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

            if (!pcConnection || pcConnection.connectionState === 'closed' || pcConnection.iceConnectionState === 'closed') {
                finish(reject, new Error('La conexión se cerró antes de confirmar el envío del stream'));
                return;
            }

            try {
                let stats = await pcConnection.getStats();
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