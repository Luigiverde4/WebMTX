/**
 * UI DEL EMISOR WHIP - MEDIA MTX
 * Gestiona DOM, paths, dispositivos, ajustes y estadísticas visuales.
 */

// Información de pantalla
let statusEl = document.getElementById('status');
let activePathsList = document.getElementById('activePathsList');
let codecStatsEl = document.getElementById('codecStats');
let codecAvisoEl = document.getElementById('codecAviso');
let previewVacioEl = document.getElementById('previewVacio');

// Entradas de usuario
let serverInput = document.getElementById('server');
let endpointInput = document.getElementById('endpoint');

// Fuentes multimedia y ajustes
let videoSource = document.getElementById('videoSource');
let audioSource = document.getElementById('audioSource');
let resolution = document.getElementById('resolution');
let frameRateSelect = document.getElementById('frameRate');
let videoCodecPreference = document.getElementById('videoCodecPreference');
let bitrateInput = document.getElementById('bitrate');
let bitrateValueEl = document.getElementById('bitrateValue');
let contentHintSelect = document.getElementById('contentHint');
let degradacionSelect = document.getElementById('degradacion');
let escalaEnvioSelect = document.getElementById('escalaEnvio');
let audioBitrateSelect = document.getElementById('audioBitrate');
let echoCancellationCheck = document.getElementById('echoCancellation');
let noiseSuppressionCheck = document.getElementById('noiseSuppression');
let autoGainControlCheck = document.getElementById('autoGainControl');

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
let muestraTraficoPrevia = new Map();

const CODEC_STATS_INTERVAL_MS = 500;
// 6 muestras x 500 ms = 3 s sin enviar bytes antes de cortar (evita falsos positivos)
const STALLED_BYTES_SENT_MAX_SAMPLES = 6;
const PATHS_SONDEO_MS = 5000;
const CODEC_RECOMENDADO = 'video/h264';

const VIDEO_CODEC_EXCLUDES = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03']);

// AJUSTES PERSISTENTES
/**
 * Guarda en localStorage todo lo configurable del emisor.
 */
function guardarAjustesDesdeUi() {
    guardarAjustesEmisor({
        camara: videoSource.value,
        micro: audioSource.value,
        codec: videoCodecPreference.value,
        resolucion: resolution.value,
        fps: frameRateSelect.value,
        bitrateMbps: Number(bitrateInput.value),
        contentHint: contentHintSelect.value,
        degradacion: degradacionSelect.value,
        escala: escalaEnvioSelect.value,
        audioBitrate: audioBitrateSelect.value,
        eco: echoCancellationCheck.checked,
        ruido: noiseSuppressionCheck.checked,
        ganancia: autoGainControlCheck.checked
    });
    localStorage.setItem('broadcaster_video_codec', videoCodecPreference.value || 'auto');
}

function seleccionarSiExiste(select, valor) {
    if (valor !== undefined && valor !== null && [...select.options].some(o => o.value === String(valor))) {
        select.value = String(valor);
    }
}

/**
 * Restaura los ajustes guardados en la UI (excepto códec y dispositivos,
 * que dependen de lo que ofrezca el navegador y se restauran al rellenarlos).
 */
function restaurarAjustesEnUi() {
    let ajustes = leerAjustesEmisor();
    if (!ajustes) return;
    seleccionarSiExiste(resolution, ajustes.resolucion);
    seleccionarSiExiste(frameRateSelect, ajustes.fps);
    seleccionarSiExiste(contentHintSelect, ajustes.contentHint);
    seleccionarSiExiste(degradacionSelect, ajustes.degradacion);
    seleccionarSiExiste(escalaEnvioSelect, ajustes.escala);
    seleccionarSiExiste(audioBitrateSelect, ajustes.audioBitrate);
    if (Number(ajustes.bitrateMbps) > 0) bitrateInput.value = ajustes.bitrateMbps;
    if (typeof ajustes.eco === 'boolean') echoCancellationCheck.checked = ajustes.eco;
    if (typeof ajustes.ruido === 'boolean') noiseSuppressionCheck.checked = ajustes.ruido;
    if (typeof ajustes.ganancia === 'boolean') autoGainControlCheck.checked = ajustes.ganancia;
}

// CODECS VIDEO
/**
 * Devuelve la etiqueta legible para un códec de vídeo dado su MIME type.
 * @param {string} mimeType - MIME type del códec.
 * @returns {string}
 */
function cogerVideoCodecLabel(mimeType) {
    if (mimeType === 'video/h264') return 'H264 (recomendado)';
    if (mimeType === 'video/h265' || mimeType === 'video/hevc') return 'H265 / HEVC';
    if (mimeType === 'video/vp8') return 'VP8';
    if (mimeType === 'video/vp9') return 'VP9';
    if (mimeType === 'video/av1') return 'AV1';

    let family = mimeType.split('/')[1] || mimeType;
    return family.toUpperCase();
}

/**
 * Rellena el selector de códec con los códecs de vídeo soportados por el navegador.
 * Por defecto H264: es el que mejor se reproduce después en Repeticiones.
 */
function actualizarOpcionesCodecVideo() {
    if (!videoCodecPreference) return;

    // Solo se respeta el códec guardado si viene de esta versión (con ajustes);
    // la versión anterior guardaba H265 por defecto.
    let ajustes = leerAjustesEmisor();
    let previousValue = ajustes ? (ajustes.codec || '') : '';
    let options = [{ value: 'auto', label: 'Automático (lo decide el navegador)' }];

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
                options.push({ value: mimeType, label: cogerVideoCodecLabel(mimeType) });
            });
        }
    }

    videoCodecPreference.innerHTML = options
        .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
        .join('');

    let defaultValue = options.some(option => option.value === CODEC_RECOMENDADO) ? CODEC_RECOMENDADO : 'auto';
    videoCodecPreference.value = options.some(option => option.value === previousValue) ? previousValue : defaultValue;
    avisarSiCodecNoRecomendado();
}

/**
 * Devuelve el códec de vídeo seleccionado por el usuario.
 * @returns {string}
 */
function cogerVideoCodecPreferencia() {
    return videoCodecPreference ? videoCodecPreference.value : 'auto';
}

/**
 * Guarda la preferencia de códec de vídeo.
 */
function guardarPreferenciaCodecVideo() {
    guardarAjustesDesdeUi();
    avisarSiCodecNoRecomendado();
}

function avisarSiCodecNoRecomendado() {
    let codec = cogerVideoCodecPreferencia();
    let noRecomendado = codec !== CODEC_RECOMENDADO && codec !== 'auto';
    codecAvisoEl.textContent = noRecomendado
        ? 'Con este códec las repeticiones pueden no reproducirse en el navegador. Usa H264 si vas a repetir jugadas.'
        : '';
    codecAvisoEl.classList.toggle('mensaje-linea--error', noRecomendado);
}

/**
 * Bitrate de vídeo elegido en el deslizador, en bps.
 */
function cogerBitrateVideo() {
    return Math.round(Number(bitrateInput.value) * 1_000_000);
}

function actualizarEtiquetaBitrate() {
    bitrateValueEl.textContent = `${Number(bitrateInput.value).toLocaleString('es-ES')} Mbps`;
}


// LO QUE SE ESTÁ ENVIANDO
/**
 * Muestra lo que la cámara entrega de verdad (getSettings) frente a lo pedido.
 * @param {MediaStream} stream
 */
function mostrarAplicado(stream) {
    let pista = stream ? stream.getVideoTracks()[0] : null;
    let camaraEl = document.getElementById('aplicadoCamara');
    let capturaEl = document.getElementById('aplicadoCaptura');
    let avisoEl = document.getElementById('aplicadoAviso');

    if (!pista) {
        camaraEl.textContent = '—';
        capturaEl.textContent = '—';
        avisoEl.textContent = '';
        return;
    }

    let ajustes = pista.getSettings();
    camaraEl.textContent = pista.label || 'Cámara';
    let fps = ajustes.frameRate ? Math.round(ajustes.frameRate * 10) / 10 : '?';
    capturaEl.textContent = `${ajustes.width || '?'}×${ajustes.height || '?'} a ${fps} fps`;

    let [anchoPedido, altoPedido] = resolution.value.split('x').map(Number);
    let fpsPedido = Number(frameRateSelect.value);
    let difiere = (ajustes.width && ajustes.width !== anchoPedido) || (ajustes.height && ajustes.height !== altoPedido);
    let fpsDifiere = ajustes.frameRate && Math.abs(ajustes.frameRate - fpsPedido) > 1;
    avisoEl.textContent = difiere || fpsDifiere
        ? `La cámara no da ${anchoPedido}×${altoPedido} a ${fpsPedido} fps: entrega lo más cercano que admite.`
        : '';
}

const MOTIVOS_LIMITACION = {
    none: 'Ninguna',
    cpu: 'CPU: el equipo no llega a codificar a esta calidad',
    bandwidth: 'Red: el ancho de banda no da para más',
    other: 'Otra'
};

// STATS RTP
/**
 * Muestra un estado por defecto en el panel de códecs.
 * @param {string} message - Mensaje a mostrar.
 */
function ponerMensajeStatsCodec(message, tipo = '') {
    if (!codecStatsEl) return;
    codecStatsEl.innerHTML = `<p class="vacio${tipo ? ` vacio--${tipo}` : ''}">${escapeHtml(message)}</p>`;
}

/**
 * Renderiza una tabla con los códecs, bytes y bitrate real de audio y vídeo.
 * @param {Array<object>} rows - Filas de estadísticas.
 */
function renderizarStatsCodec(rows) {
    if (!codecStatsEl) return;

    if (!rows || rows.length === 0) {
        ponerMensajeStatsCodec('Conectado. Esperando el primer paquete RTP…');
        return;
    }

    let body = rows
        .map(row => `
            <tr>
                <td>${row.kind === 'video' ? 'Vídeo' : 'Audio'}</td>
                <td>${escapeHtml(row.mimeType)}</td>
                <td class="numero">${escapeHtml(row.payloadType)}</td>
                <td class="numero">${escapeHtml(row.clockRate)}</td>
                <td class="numero">${escapeHtml(row.channels)}</td>
                <td class="numero">${formatBytes(row.bytesSent)}</td>
                <td class="numero">${row.kbps === null ? '—' : `${row.kbps.toLocaleString('es-ES')} kbps`}</td>
            </tr>
        `)
        .join('');

    codecStatsEl.innerHTML = `
        <table class="tabla">
            <thead>
                <tr>
                    <th>Pista</th>
                    <th>Códec</th>
                    <th class="numero">PT</th>
                    <th class="numero">Reloj</th>
                    <th class="numero">Canales</th>
                    <th class="numero">Enviado</th>
                    <th class="numero">Bitrate</th>
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

    let stats = await pc.getStats();
    let rows = [];
    let totalBytesSent = 0;
    let ahora = performance.now();

    stats.forEach(report => {
        if (report.type !== 'outbound-rtp' || report.isRemote) return;
        if (report.kind !== 'audio' && report.kind !== 'video') return;

        let codec = report.codecId ? stats.get(report.codecId) : null;
        let bytesSent = typeof report.bytesSent === 'number' ? report.bytesSent : 0;
        let previa = muestraTraficoPrevia.get(report.id);
        let kbps = previa && ahora > previa.t
            ? Math.max(0, Math.round(((bytesSent - previa.bytes) * 8) / (ahora - previa.t)))
            : null;
        muestraTraficoPrevia.set(report.id, { bytes: bytesSent, t: ahora });

        rows.push({
            kind: report.kind,
            mimeType: codec && codec.mimeType ? codec.mimeType.replace(/^(video|audio)\//, '') : 'desconocido',
            payloadType: codec && codec.payloadType !== undefined ? codec.payloadType : '—',
            clockRate: codec && codec.clockRate !== undefined ? codec.clockRate : '—',
            channels: codec && codec.channels !== undefined ? codec.channels : '—',
            bytesSent,
            kbps
        });

        if (report.kind === 'video') {
            let codificacion = report.frameWidth
                ? `${report.frameWidth}×${report.frameHeight} a ${Math.round(report.framesPerSecond || 0)} fps`
                : 'Esperando fotogramas…';
            document.getElementById('aplicadoCodificacion').textContent =
                `${codificacion}${kbps !== null ? `, ${(kbps / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} Mbps` : ''}`;
            let motivo = report.qualityLimitationReason || 'none';
            document.getElementById('aplicadoLimitacion').textContent = MOTIVOS_LIMITACION[motivo] || motivo;
        }

        totalBytesSent += bytesSent;
    });

    rows.sort((a, b) => b.kind.localeCompare(a.kind));
    renderizarStatsCodec(rows);

    return {
        monitorable: rows.length > 0,
        totalBytes: totalBytesSent
    };
}

/**
 * Inicia el refresco periódico de estadísticas WebRTC con watchdog:
 * si deja de salir tráfico, avisa y corta la emisión.
 */
function startCodecStatsPolling() {
    stopCodecStatsPolling();
    watchdogAlertShown = false;
    muestraTraficoPrevia = new Map();

    codecStatsWatchdog = createTrafficWatchdog({
        intervalMs: CODEC_STATS_INTERVAL_MS,
        maxStalledSamples: STALLED_BYTES_SENT_MAX_SAMPLES,
        sample: actualizarCodecStats,
        onStalled: () => {
            console.warn('bytesSent estancado, deteniendo transmisión');
            ponerMensajeStatsCodec('Sin envío RTP: no salen datos hacia el servidor.', 'error');
            if (!watchdogAlertShown) {
                watchdogAlertShown = true;
                mostrarAviso('Emisión detenida: no salían datos hacia el servidor durante 3 s. Comprueba la red y vuelve a emitir.', 'error');
            }
            stopBroadcast({ error: 'No salían datos hacia el servidor' });
        },
        onError: error => {
            console.warn('No se pudieron leer estadísticas WebRTC:', error);
            ponerMensajeStatsCodec('No se pudieron leer las estadísticas WebRTC.', 'error');
        }
    });

    codecStatsWatchdog.start();
}

/**
 * Detiene el refresco periódico de estadísticas WebRTC.
 */
function stopCodecStatsPolling() {
    if (codecStatsWatchdog) {
        codecStatsWatchdog.stop();
        codecStatsWatchdog = null;
    }

    ponerMensajeStatsCodec('Sin datos: empieza a emitir para ver el tráfico.');
    document.getElementById('aplicadoCodificacion').textContent = '—';
    document.getElementById('aplicadoLimitacion').textContent = '—';
}


// PATHS / ENDPOINTS
/**
 * Renderiza los paths activos y marca los nombres rápidos ocupados.
 */
function ponerPathsActivos() {
    document.querySelectorAll('.chip-camara[data-endpoint]').forEach(boton => {
        let ocupado = activePaths.includes(boton.dataset.endpoint);
        boton.classList.toggle('ocupado', ocupado);
        boton.title = ocupado ? 'Ya hay alguien emitiendo con este nombre' : '';
    });

    if (activePaths.length === 0) {
        activePathsList.innerHTML = '<span class="texto-2 texto-peq">Nadie está emitiendo</span>';
        return;
    }

    activePathsList.innerHTML = activePaths
        .map(path => `<span class="chip-camara chip-camara--info" data-camara="${escapeHtml(path)}">${escapeHtml(path)}</span>`)
        .join('');
    activePathsList.querySelectorAll('[data-camara]').forEach(chip => aplicarColorCamara(chip, chip.dataset.camara));
}

/**
 * Consulta MediaMTX y actualiza la lista de paths activos.
 * @param {boolean} [silencioso=false] - true en el sondeo automático (sin avisos de error)
 */
async function actualizarPathsActivos(silencioso = false) {
    try {
        let response = await fetch('/api/mediamtx/v3/paths/list');
        if (!response.ok) throw new Error(`API no disponible (HTTP ${response.status})`);

        let data = await response.json();
        activePaths = (data.items || [])
            .filter(path => path.ready)
            .map(path => path.name)
            .sort();

        ponerPathsActivos();
    } catch (error) {
        activePathsList.innerHTML = '<span class="mensaje-linea mensaje-linea--error">No se pudo consultar MediaMTX</span>';
        if (!silencioso) mostrarAviso(`No se pudo consultar MediaMTX: ${error.message}`, 'error');
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
    endpointInput.value = sanitizarEndpoint(name);
    marcarEndpointElegido();
    localStorage.setItem('broadcaster_endpoint', endpointInput.value);
}

function marcarEndpointElegido() {
    document.querySelectorAll('.chip-camara[data-endpoint]').forEach(boton => {
        boton.setAttribute('aria-pressed', String(boton.dataset.endpoint === endpointInput.value));
    });
}


// UI
// Cómo se ve cada estado de la emisión (js/utils/estado-emision.js).
// pildora: clase de .estado · tally: estado de la barra · texto: lo que se lee.
const VISTA_ESTADO_EMISION = {
    inactivo: { pildora: 'inactivo', tally: 'inactivo', texto: 'Sin emitir' },
    previsualizando: { pildora: 'inactivo', tally: 'inactivo', texto: 'Previsualizando' },
    abriendo: { pildora: 'conectando', tally: 'conectando', texto: 'Abriendo la cámara' },
    negociando: { pildora: 'conectando', tally: 'conectando', texto: 'Conectando' },
    esperando_trafico: { pildora: 'conectando', tally: 'conectando', texto: 'Comprobando el envío' },
    // En 'inestable' el tally sigue en rojo para no reiniciar el cronómetro por un microcorte
    en_directo: { pildora: 'directo', tally: 'directo', texto: 'En directo' },
    inestable: { pildora: 'conectando', tally: 'directo', texto: 'Conexión inestable' },
    deteniendo: { pildora: 'conectando', tally: 'conectando', texto: 'Deteniendo' },
    error: { pildora: 'error', tally: 'error', texto: 'Error' }
};

/**
 * Pinta TODA la UI que depende del estado de la emisión: píldora, tally,
 * botones y rótulo "En directo". Es el único sitio que la toca.
 * @param {string} estado - Uno de ESTADOS_EMISION.
 * @param {{mensaje?: string}} [contexto]
 */
function pintarEstadoEmision(estado, contexto = {}) {
    let vista = VISTA_ESTADO_EMISION[estado] || VISTA_ESTADO_EMISION.inactivo;
    let texto = estado === 'error' && contexto.mensaje ? contexto.mensaje : vista.texto;
    let endpoint = endpointInput.value;

    statusEl.className = `estado estado--${vista.pildora}`;
    statusEl.textContent = texto;

    if (vista.tally === 'directo') {
        ponerTally('directo', { estado: texto, detalle: endpoint, cronometro: true });
    } else if (vista.tally === 'inactivo') {
        ponerTally('inactivo', { estado: 'Sin emitir', detalle: estado === 'previsualizando' ? 'Previsualizando' : '' });
    } else {
        ponerTally(vista.tally, { estado: texto, detalle: vista.tally === 'error' ? '' : endpoint });
    }

    let libre = sinEmisionEnCurso();
    startBtn.disabled = !libre;
    stopBtn.disabled = libre || estado === 'deteniendo';
    document.getElementById('previewBtn').disabled = !libre;
    liveIndicator.hidden = !ESTADOS_EN_DIRECTO.has(estado);
}

/**
 * Pone el monitor (vídeo + rótulo "En directo") a pantalla completa, o sale.
 * En el móvil, si la imagen es horizontal, intenta girar a apaisado.
 * @param {Event} [evento]
 */
async function alternarPantallaCompleta(evento) {
    if (evento) evento.stopPropagation(); // no disparar la previsualización del clic en el monitor
    let monitor = document.getElementById('monitorEmisor');

    if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        return;
    }

    try {
        if (monitor.requestFullscreen) {
            await monitor.requestFullscreen({ navigationUI: 'hide' });
        } else if (monitor.webkitRequestFullscreen) {
            monitor.webkitRequestFullscreen();
        } else if (preview.webkitEnterFullscreen) {
            preview.webkitEnterFullscreen(); // iPhone: solo el vídeo admite pantalla completa
            return;
        }
        let horizontal = preview.videoWidth >= preview.videoHeight;
        if (horizontal && screen.orientation && screen.orientation.lock) {
            await screen.orientation.lock('landscape').catch(() => {}); // no todos los navegadores lo permiten
        }
    } catch (error) {
        mostrarAviso(`No se pudo poner a pantalla completa: ${error.message}`, 'aviso');
    }
}

function actualizarBotonPantallaCompleta() {
    let boton = document.getElementById('pantallaCompletaBtn');
    let dentro = Boolean(document.fullscreenElement);
    boton.setAttribute('aria-label', dentro ? 'Salir de pantalla completa' : 'Ver a pantalla completa');
    boton.querySelector('use').setAttribute('href', `img/iconos.svg#${dentro ? 'contraer' : 'expandir'}`);
    if (!dentro && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
}

document.addEventListener('fullscreenchange', actualizarBotonPantallaCompleta);

function actualizarVacioPreview() {
    previewVacioEl.hidden = Boolean(preview.srcObject);
}

/**
 * Muestra la previsualización local cuando aún no existe stream activo.
 */
async function visualizarPreview() {
    if (!sinEmisionEnCurso()) return; // no tocar la preview mientras se emite o se conecta
    if (localStream) return;

    try {
        localStream = await cogerStreamVideoAudioLocal();
        // Pudo empezar una emisión mientras se abría la cámara
        if (!sinEmisionEnCurso()) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            return;
        }
        preview.srcObject = localStream;
        actualizarVacioPreview();
        cambiarEstadoEmision(ESTADOS_EMISION.PREVISUALIZANDO);
    } catch (error) {
        mostrarError('No se pudo iniciar la previsualización', error);
        cambiarEstadoEmision(ESTADOS_EMISION.ERROR, { mensaje: 'No se pudo abrir la cámara' });
    }
}

/**
 * Muestra un error al usuario (aviso) y deja detalle técnico en consola.
 * No cambia el estado de la emisión: eso lo decide quien llama (un fallo al
 * refrescar dispositivos no debe marcar error en mitad de una emisión).
 * @param {string} userMessage - Mensaje breve.
 * @param {Error|string} error - Detalle técnico del fallo.
 */
function mostrarError(userMessage, error) {
    let detail = error && error.message ? error.message : String(error || 'Error desconocido');
    console.error(userMessage, error);
    mostrarAviso(`${userMessage}. Detalle: ${detail}`, 'error');
}

document.addEventListener('DOMContentLoaded', async () => {
    restaurarAjustesEnUi();
    actualizarEtiquetaBitrate();

    // Servidor = host de esta página (sin protocolo)
    serverInput.value = window.location.host;
    let savedEndpoint = localStorage.getItem('broadcaster_endpoint');
    if (savedEndpoint) endpointInput.value = sanitizarEndpoint(savedEndpoint);
    marcarEndpointElegido();
    pintarEstadoEmision(estadoEmision);

    actualizarPathsActivos(true);
    setInterval(() => {
        if (!document.hidden) actualizarPathsActivos(true);
    }, PATHS_SONDEO_MS);

    actualizarOpcionesCodecVideo();
    await iniciarDispositivos();
    guardarAjustesDesdeUi();
});

// Nombre del endpoint: saneado en vivo (al escribir o pegar)
endpointInput.addEventListener('input', () => {
    let posicion = endpointInput.selectionStart;
    let limpio = sanitizarEndpoint(endpointInput.value);
    if (limpio !== endpointInput.value) {
        let recorte = endpointInput.value.length - limpio.length;
        endpointInput.value = limpio;
        endpointInput.setSelectionRange(Math.max(0, posicion - recorte), Math.max(0, posicion - recorte));
    }
    marcarEndpointElegido();
});

document.querySelectorAll('.chip-camara[data-endpoint]').forEach(boton => {
    aplicarColorCamara(boton, boton.dataset.endpoint);
    boton.addEventListener('click', () => ponerEndpoint(boton.dataset.endpoint));
});

// Cambios que requieren volver a abrir la cámara (solo en previsualización)
[videoSource, audioSource, resolution, frameRateSelect, echoCancellationCheck, noiseSuppressionCheck, autoGainControlCheck]
    .forEach(control => control.addEventListener('change', cambioDispositivo));

videoCodecPreference.addEventListener('change', guardarPreferenciaCodecVideo);

// Ajustes aplicables en directo
bitrateInput.addEventListener('input', actualizarEtiquetaBitrate);
bitrateInput.addEventListener('change', () => { actualizarEtiquetaBitrate(); guardarAjustesDesdeUi(); aplicarAjustesEnDirecto(); });
[contentHintSelect, degradacionSelect, escalaEnvioSelect, audioBitrateSelect].forEach(control => {
    control.addEventListener('change', () => { guardarAjustesDesdeUi(); aplicarAjustesEnDirecto(); });
});

navigator.mediaDevices.addEventListener('devicechange', actualizarDispositivos);
preview.addEventListener('click', visualizarPreview);
previewVacioEl.addEventListener('click', visualizarPreview);
