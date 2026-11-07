/**
 * UI DEL EMISOR WHIP - MEDIA MTX
 * Gestiona DOM, paths, dispositivos, ajustes y estadísticas visuales.
 */

// Información de pantalla
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

// No son códecs de imagen (retransmisión y corrección de errores), salvo VP8:
// MediaMTX no graba VP8 en fMP4 ("skipping track (VP8)") y se quedaría sin
// repeticiones. Por eso tampoco hay "Automático": Chrome elige VP8 por defecto.
const VIDEO_CODEC_EXCLUDES = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03', 'video/vp8']);

// Por qué un códec que no es H264 puede dar problemas. En Chrome los cuatro se
// publican, se ven por WHEP y se graban; el riesgo está en otros visores.
const AVISOS_CODEC = {
    'video/vp9': 'VP9 se graba bien, pero algunos navegadores (sobre todo Safari) pueden no reproducirlo. Si dudas, usa H264.',
    'video/av1': 'AV1 suele gastar bastante más CPU al codificar y no todos los equipos lo reproducen. Si dudas, usa H264.',
    'video/h265': 'H265 solo se ve en navegadores con decodificación por hardware (Chrome en Windows con GPU compatible). Muchos visores no podrán verlo.'
};

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
        degradacion: degradacionSelect.value,
        escala: escalaEnvioSelect.value,
        audioBitrate: audioBitrateSelect.value,
        eco: echoCancellationCheck.checked,
        ruido: noiseSuppressionCheck.checked,
        ganancia: autoGainControlCheck.checked
    });
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
    let options = [];

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

    // Sin getCapabilities (navegador muy antiguo): 'auto' deja el códec al navegador
    if (options.length === 0) options.push({ value: 'auto', label: 'El del navegador' });
    let defaultValue = options.some(option => option.value === CODEC_RECOMENDADO) ? CODEC_RECOMENDADO : options[0].value;
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
    let aviso = AVISOS_CODEC[codec] || '';
    codecAvisoEl.textContent = aviso;
    codecAvisoEl.classList.toggle('mensaje-linea--error', Boolean(aviso));
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


// OBJETIVO FRENTE A REAL
// Resolución, fps y bitrate de vídeo son objetivos: los pide la app, pero el
// resultado lo deciden la cámara (modos, luz), la CPU y la red. Junto a cada
// uno se enseña lo real; en ámbar y diciendo quién lo impide si no coincide.

// Lo que entrega la cámara (getSettings) y lo que se pidió al abrirla:
// se compara con eso, no con el selector (que puede tener cambios pendientes).
let capturaReal = null;   // { ancho, alto, fps, anchoPedido, altoPedido, fpsPedido }
// Lo que sale codificado (outbound-rtp); el bitrate, suavizado (~2 s).
let envioReal = null;     // { ancho, alto, fps, kbps, motivo }

const QUIEN_LIMITA = { cpu: 'falta CPU', bandwidth: 'falta red', other: 'lo limita el navegador' };

// Qué recorta cada opción de "Si no da para todo, sacrificar…"
const SACRIFICIO = {
    'maintain-resolution': 'baja los fps para mantener la nitidez',
    'maintain-framerate': 'baja la resolución para mantener la fluidez',
    balanced: 'baja un poco de cada'
};

/**
 * Guarda lo que entrega la cámara de verdad (getSettings) frente a lo pedido.
 * @param {MediaStream|null} stream
 */
function mostrarAplicado(stream) {
    let pista = stream ? stream.getVideoTracks()[0] : null;
    if (!pista) {
        capturaReal = null;
    } else {
        let ajustes = pista.getSettings();
        let [anchoPedido, altoPedido] = resolution.value.split('x').map(Number);
        capturaReal = {
            ancho: ajustes.width,
            alto: ajustes.height,
            fps: ajustes.frameRate ? Math.round(ajustes.frameRate * 10) / 10 : null,
            anchoPedido,
            altoPedido,
            fpsPedido: Number(frameRateSelect.value)
        };
    }
    pintarObjetivos();
}

function ponerReal(id, texto, difiere = false) {
    let el = document.getElementById(id);
    el.textContent = texto;
    el.classList.toggle('campo__real--difiere', difiere);
}

/**
 * Pinta bajo cada ajuste "objetivo" lo que se consigue de verdad.
 */
function pintarObjetivos() {
    let c = capturaReal;
    let e = envioReal;
    let limita = e && QUIEN_LIMITA[e.motivo];
    // Chrome no cuenta como "limitación" que el codificador tire fotogramas para
    // no pasarse del bitrate: se deduce de ir pegado al techo.
    let techoKbps = cogerBitrateVideo() / 1000;
    let enElTecho = Boolean(e && e.kbps !== null && e.kbps >= techoKbps * 0.85);

    // Resolución: cámara frente a lo pedido; envío frente a lo esperable tras "Resolución enviada"
    if (!c) {
        ponerReal('realResolucion', 'Se verá al previsualizar');
    } else {
        let camaraNoDa = c.ancho && (c.ancho !== c.anchoPedido || c.alto !== c.altoPedido);
        let texto = `Cámara: ${c.ancho || '?'}×${c.alto || '?'}`;
        let reducida = false;
        if (e && e.ancho) {
            texto += ` · enviando ${e.ancho}×${e.alto}`;
            let esperado = Math.round((c.ancho || 0) / (Number(escalaEnvioSelect.value) || 1));
            reducida = e.ancho < esperado - 8;
        }
        if (camaraNoDa) texto += ' (la cámara no da más)';
        else if (reducida) texto += ` (${limita || 'la reduce el navegador'})`;
        ponerReal('realResolucion', texto, camaraNoDa || reducida);
    }

    // Fps: cámara frente a lo pedido; envío frente a la cámara
    if (!c) {
        ponerReal('realFps', 'Se verá al previsualizar');
    } else {
        let camaraNoDa = c.fps && c.fps < c.fpsPedido - 1;
        let texto = `Cámara: ${c.fps ?? '?'}`;
        let bajan = false;
        if (e && e.fps !== null) {
            texto += ` · enviando ${e.fps}`;
            bajan = Boolean(c.fps && e.fps < c.fps - 2);
        }
        if (camaraNoDa) texto += ' (la cámara no da más; con poca luz muchas bajan)';
        else if (bajan) texto += ` (${limita || 'la imagen pide más bitrate del que hay'})`;
        ponerReal('realFps', texto, Boolean(camaraNoDa || bajan));
    }

    // Bitrate: por debajo del techo es normal (la imagen no pide más); pegado
    // al techo, el techo es lo que limita
    if (!e || e.kbps === null) {
        ponerReal('realBitrate', 'Se verá al emitir');
    } else {
        let mbps = (e.kbps / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 });
        let motivo = limita || (enElTecho ? 'en el techo: súbelo si la red lo permite' : '');
        ponerReal('realBitrate', `Enviando: ${mbps} Mbps${motivo ? ` (${motivo})` : ''}`, Boolean(motivo));
    }

    // La regla de degradación solo se enseña mientras actúa
    let degradacionEl = document.getElementById('realDegradacion');
    degradacionEl.hidden = !limita;
    if (limita) degradacionEl.textContent = `Actuando ahora (${limita}): ${SACRIFICIO[degradacionSelect.value] || 'recortando'}`;

    // Reducir la imagen: es fijo, pero se dice en qué resolución acaba saliendo
    let escala = Number(escalaEnvioSelect.value) || 1;
    if (!c || !c.ancho) {
        ponerReal('realEscala', 'Se calcula con la cámara abierta');
    } else {
        let ancho = Math.round(c.ancho / escala);
        let alto = Math.round(c.alto / escala);
        ponerReal('realEscala', escala === 1 ? `Se envía a ${c.ancho}×${c.alto}, la de la cámara` : `Se envía a ${ancho}×${alto}`);
    }
}

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
            // Media móvil: con muestras cada 500 ms, ~2 s de memoria (el número no baila)
            let kbpsSuavizado = kbps === null ? (envioReal ? envioReal.kbps : null)
                : envioReal && envioReal.kbps !== null ? Math.round(envioReal.kbps * 0.75 + kbps * 0.25) : kbps;
            envioReal = {
                ancho: report.frameWidth || null,
                alto: report.frameHeight || null,
                fps: report.framesPerSecond !== undefined ? Math.round(report.framesPerSecond) : null,
                kbps: kbpsSuavizado,
                motivo: report.qualityLimitationReason || 'none'
            };
            let codificacion = report.frameWidth
                ? `${report.frameWidth}×${report.frameHeight} a ${envioReal.fps ?? 0} fps`
                : 'Esperando fotogramas…';
            // Resumen bajo el vídeo
            document.getElementById('resumenEnvio').textContent = `${codificacion}${kbpsSuavizado !== null ? `, ${(kbpsSuavizado / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} Mbps` : ''}`;
            pintarObjetivos();
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
    envioReal = null;
    pintarObjetivos();
    document.getElementById('resumenEnvio').textContent = '';
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
// El tally es el único indicador de estado de la página.
// tally: estado de la barra · texto: lo que se lee.
const VISTA_ESTADO_EMISION = {
    inactivo: { tally: 'inactivo', texto: 'Sin emitir' },
    previsualizando: { tally: 'inactivo', texto: 'Previsualizando' },
    abriendo: { tally: 'conectando', texto: 'Abriendo la cámara' },
    negociando: { tally: 'conectando', texto: 'Conectando' },
    esperando_trafico: { tally: 'conectando', texto: 'Comprobando el envío' },
    // En 'inestable' el tally sigue en rojo para no reiniciar el cronómetro por un microcorte
    en_directo: { tally: 'directo', texto: 'En directo' },
    inestable: { tally: 'directo', texto: 'Conexión inestable' },
    deteniendo: { tally: 'conectando', texto: 'Deteniendo' },
    error: { tally: 'error', texto: 'Error' }
};

/**
 * Pinta TODA la UI que depende del estado de la emisión: tally, botones y
 * rótulo "En directo" (este solo se ve a pantalla completa). Es el único
 * sitio que la toca.
 * @param {string} estado - Uno de ESTADOS_EMISION.
 * @param {{mensaje?: string}} [contexto]
 */
function pintarEstadoEmision(estado, contexto = {}) {
    let vista = VISTA_ESTADO_EMISION[estado] || VISTA_ESTADO_EMISION.inactivo;
    let texto = estado === 'error' && contexto.mensaje ? contexto.mensaje : vista.texto;
    let endpoint = endpointInput.value;

    if (vista.tally === 'directo') {
        ponerTally('directo', { estado: texto, detalle: endpoint, cronometro: true });
    } else if (vista.tally === 'inactivo') {
        ponerTally('inactivo', { estado: 'Sin emitir', detalle: estado === 'previsualizando' ? 'Previsualizando' : '' });
    } else {
        ponerTally(vista.tally, { estado: texto, detalle: vista.tally === 'error' ? '' : endpoint });
    }

    let libre = sinEmisionEnCurso();
    // Con la emisión en marcha y ajustes cambiados, Emitir pasa a "Volver a emitir"
    let reemitible = ESTADOS_EN_DIRECTO.has(estado) && hayCambiosPendientes();
    startBtn.disabled = !libre && !reemitible;
    document.getElementById('startBtnTexto').textContent = reemitible ? 'Volver a emitir' : 'Emitir';
    document.getElementById('revertirBtn').hidden = !reemitible;
    stopBtn.disabled = libre || estado === 'deteniendo';
    document.getElementById('previewBtn').disabled = !libre;
    liveIndicator.hidden = !ESTADOS_EN_DIRECTO.has(estado);
}

// AJUSTES QUE SOLO SE APLICAN AL RECONECTAR
// Al empezar a emitir se guarda una foto de estos ajustes; si durante la
// emisión cambian, Emitir pasa a "Volver a emitir" y aparece "Deshacer cambios".
let ajustesEmitidos = null;
let avisoCambiosPendientesMostrado = false;

/** Los ajustes que solo se aplican al volver a abrir la cámara y la conexión. */
function leerAjustesDeReconexion() {
    return {
        endpoint: endpointInput.value,
        camara: videoSource.value,
        micro: audioSource.value,
        codec: videoCodecPreference.value,
        resolucion: resolution.value,
        fps: frameRateSelect.value,
        eco: echoCancellationCheck.checked,
        ruido: noiseSuppressionCheck.checked,
        ganancia: autoGainControlCheck.checked
    };
}

/** Guarda la foto de lo que se va a emitir (la llama startBroadcast). */
function fijarAjustesEmitidos() {
    ajustesEmitidos = leerAjustesDeReconexion();
    avisoCambiosPendientesMostrado = false;
}

/** Olvida la foto (al detener). */
function olvidarAjustesEmitidos() {
    ajustesEmitidos = null;
    avisoCambiosPendientesMostrado = false;
}

/** ¿Hay ajustes distintos de los que se están emitiendo? */
/**
 * ¿Hay cambios que solo se aplican volviendo a emitir? Cámara, formato, micro
 * y procesado se aplican en directo (js/broadcaster-captura.js); el códec, el
 * nombre y pasar de "Sin micrófono" a un micro cambian la propia conexión.
 */
function hayCambiosPendientes() {
    if (!ajustesEmitidos || !ESTADOS_EN_DIRECTO.has(estadoEmision)) return false;
    let actuales = leerAjustesDeReconexion();
    return actuales.endpoint !== ajustesEmitidos.endpoint
        || actuales.codec !== ajustesEmitidos.codec
        || cambiaPresenciaMicro(ajustesEmitidos, actuales);
}

/** Repinta los botones tras un cambio de ajustes y avisa la primera vez. */
function revisarCambiosPendientes() {
    pintarEstadoEmision(estadoEmision, { mensaje: mensajeErrorEmision });
    if (hayCambiosPendientes() && !avisoCambiosPendientesMostrado) {
        avisoCambiosPendientesMostrado = true;
        mostrarAviso('Este cambio se aplica al volver a emitir. Pulsa "Volver a emitir" o "Deshacer cambios".', 'info');
    }
}

/** Devuelve los controles a lo que se está emitiendo ahora. */
/**
 * Muestra (o esconde) el previo: la cámara preparada que aún no sale. Con
 * previo, el monitor grande lleva la etiqueta "Programa".
 * @param {MediaStreamTrack|null} pista
 */
function pintarPrevio(pista) {
    let previoEl = document.getElementById('previo');
    let video = document.getElementById('previoVideo');
    previoEl.hidden = !pista;
    document.getElementById('etiquetaPrograma').hidden = !pista;
    if (!pista) {
        video.srcObject = null;
        return;
    }
    video.srcObject = new MediaStream([pista]);
    let ajustes = pista.getSettings();
    let tamaño = ajustes.width ? `, ${ajustes.width}×${ajustes.height}` : '';
    // El nombre, como en el selector (la pista no siempre lo trae)
    let opcion = [...videoSource.options].find(o => o.value === ajustes.deviceId) || videoSource.selectedOptions[0];
    let nombre = (opcion && opcion.text) || pista.label || 'otra cámara';
    document.getElementById('previoNombre').textContent = `${nombre}${tamaño}`;
}

/** Devuelve a la UI los ajustes de captura (cámara, micro, resolución, fps, procesado). */
function ponerAjustesDeCaptura(a) {
    seleccionarSiExiste(videoSource, a.camara);
    seleccionarSiExiste(audioSource, a.micro);
    seleccionarSiExiste(resolution, a.resolucion);
    seleccionarSiExiste(frameRateSelect, a.fps);
    echoCancellationCheck.checked = a.eco;
    noiseSuppressionCheck.checked = a.ruido;
    autoGainControlCheck.checked = a.ganancia;
}

function revertirAjustes() {
    if (!ajustesEmitidos) return;
    let a = ajustesEmitidos;
    endpointInput.value = a.endpoint;
    seleccionarSiExiste(videoCodecPreference, a.codec);
    // La captura sigue lo que sale ahora (pudo cambiar en directo); solo se
    // deshace lo que pedía volver a emitir: pasar de "Sin micrófono" a un micro
    if (capturaAbiertaCon && cambiaPresenciaMicro(a, leerAjustesDeReconexion())) {
        seleccionarSiExiste(audioSource, capturaAbiertaCon.micro);
    }

    marcarEndpointElegido();
    avisarSiCodecNoRecomendado();
    guardarAjustesDesdeUi();
    avisoCambiosPendientesMostrado = false;
    pintarEstadoEmision(estadoEmision, { mensaje: mensajeErrorEmision });
    mostrarAviso('Ajustes devueltos a los de la emisión actual', 'ok', 2000);
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
        capturaAbiertaCon = leerAjustesDeReconexion(); // para volver aquí si un cambio falla
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
    serverInput.value = window.location.hostname; // sin el puerto de la página: WebRTC va a MediaMTX (:8889)
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

// Cambios que requieren volver a abrir la cámara: en previsualización se
// aplican al momento; emitiendo, se quedan pendientes hasta "Volver a emitir".
[videoSource, audioSource, resolution, frameRateSelect, echoCancellationCheck, noiseSuppressionCheck, autoGainControlCheck]
    .forEach(control => control.addEventListener('change', () => {
        cambioDispositivo();
        revisarCambiosPendientes();
    }));

videoCodecPreference.addEventListener('change', () => {
    guardarPreferenciaCodecVideo();
    revisarCambiosPendientes();
});
endpointInput.addEventListener('input', revisarCambiosPendientes);

// Ajustes aplicables en directo
bitrateInput.addEventListener('input', actualizarEtiquetaBitrate);
bitrateInput.addEventListener('change', () => { actualizarEtiquetaBitrate(); guardarAjustesDesdeUi(); aplicarAjustesEnDirecto(); });
[degradacionSelect, escalaEnvioSelect, audioBitrateSelect].forEach(control => {
    control.addEventListener('change', () => { guardarAjustesDesdeUi(); aplicarAjustesEnDirecto(); pintarObjetivos(); });
});

navigator.mediaDevices.addEventListener('devicechange', actualizarDispositivos);
preview.addEventListener('click', visualizarPreview);
previewVacioEl.addEventListener('click', visualizarPreview);
