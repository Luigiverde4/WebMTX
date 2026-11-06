/**
 * UI DEL REPRODUCTOR DE GRABACIONES
 * Gestiona DOM, render y eventos visuales. Pensada también para manejarse desde
 * un dock de OBS: selección por desplegables y mensajes de estado en el panel
 * (sin alert bloqueante).
 */

/**
 * ELEMENTOS DOM
 */
let video = document.getElementById('video');
let currentRecordingEl = document.getElementById('currentRecording');
let recordingCountEl = document.getElementById('recordingCount');
let statusMsgEl = document.getElementById('statusMsg');
let streamSelectEl = document.getElementById('streamSelect');
let recordingSelectEl = document.getElementById('recordingSelect');
let playbackModeEl = document.getElementById('playbackMode');
let startOffsetInput = document.getElementById('startOffset');
let lookbackTimeInput = document.getElementById('lookbackTime');
let lookbackSlider = document.getElementById('lookbackSlider');
let lookbackValueEl = document.getElementById('lookbackValue');
let specificTimeInput = document.getElementById('specificTime');
let timelineSlider = document.getElementById('timelineSlider');
let timelineStart = document.getElementById('timelineStart');
let timelineEnd = document.getElementById('timelineEnd');
let timelineBubble = document.getElementById('timelineBubble');
let obsPendingEl = document.getElementById('obsPending');
let speedDisplay = document.getElementById('speedDisplay');
let timeDisplay = document.getElementById('timeDisplay');

/**
 * ESTADO GLOBAL
 */
let allRecordings = [];
let selectedRecording = null;

// Firma de la lista con la que se pintaron los desplegables por última vez.
let firmaPintada = '';

// El usuario está buscando un momento con la línea temporal: el refresco
// automático no debe repintarla y moverle el punto bajo el dedo.
let ajustandoTimeline = false;

// Clave de localStorage donde se recuerdan los controles entre recargas.
const CLAVE_PREFERENCIAS = 'webmtx.playback.preferencias';

// Mientras se restaura el estado guardado, los desplegables pasan por valores
// intermedios (se vacían al repintarlos). Guardar en ese momento machacaría las
// preferencias con basura, así que se silencia el guardado hasta terminar.
let restaurando = false;

// ?stream=cam1 (enlace "Repetir" de Inicio) manda sobre lo guardado
const STREAM_DE_URL = new URLSearchParams(window.location.search).get('stream');


// PERSISTENCIA DE LA SELECCIÓN

/**
 * Indica si la lista recibida difiere de la que hay pintada.
 * @param {Array} grabaciones - Lista recién consultada.
 * @returns {boolean}
 */
function haCambiadoLaLista(grabaciones) {
    return firmaGrabaciones(grabaciones) !== firmaPintada;
}

/**
 * Guarda en localStorage los controles del panel para restaurarlos al recargar.
 * No guarda la reproducción en curso: al volver, el operador decide cuándo pinchar.
 */
function guardarPreferencias() {
    if (restaurando) return;

    try {
        localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({
            stream: streamSelectEl.value,
            grabacion: recordingSelectEl.value,
            modo: playbackModeEl.value,
            lookback: lookbackTimeInput.value,
            specific: specificTimeInput.value
        }));
    } catch (error) {
        // Modo incógnito o almacenamiento lleno: seguir sin persistencia.
        console.warn('No se pudieron guardar las preferencias:', error);
    }
}

/**
 * Lee las preferencias guardadas.
 * @returns {Object|null}
 */
function leerPreferencias() {
    try {
        let prefs = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS)) || {};
        if (STREAM_DE_URL) prefs.stream = STREAM_DE_URL;
        return prefs;
    } catch {
        return STREAM_DE_URL ? { stream: STREAM_DE_URL } : null;
    }
}

/**
 * Restaura los controles que no dependen de las grabaciones (modo y tiempos).
 * Los desplegables se restauran al poblarlos, cuando ya se sabe qué existe.
 */
function restaurarControles() {
    let prefs = leerPreferencias();
    if (!prefs) return;

    if (prefs.modo) playbackModeEl.value = prefs.modo;
    if (prefs.specific) specificTimeInput.value = prefs.specific;

    // Los segundos hacia atrás alimentan slider + numérico + etiqueta.
    fijarSegundosAtras(parseInt(prefs.lookback, 10) || 30);
}


// FUNCIONES DE UI

/**
 * Muestra un mensaje de estado en el panel (sustituye a los alert bloqueantes,
 * inservibles dentro de OBS). Los errores además salen como aviso.
 * @param {string} texto - Mensaje a mostrar.
 * @param {'info'|'ok'|'error'} [tipo] - Estilo del mensaje.
 */
function setEstado(texto, tipo = 'info') {
    statusMsgEl.textContent = texto || '';
    statusMsgEl.className = `mensaje-linea ${tipo}`;
}

/**
 * Pinta el rótulo de lo que se está viendo: cámara (con su color) e instante real.
 * @param {string} stream
 * @param {Date} momento
 * @param {string} [extra] - Texto adicional (p. ej. "hace 1m 20s").
 */
function pintarRotuloActual(stream, momento, extra = '') {
    currentRecordingEl.innerHTML = '';
    let punto = document.createElement('span');
    punto.className = 'punto-camara';
    aplicarColorCamara(punto, stream);
    let nombre = document.createElement('strong');
    nombre.textContent = stream;
    let hora = document.createElement('span');
    hora.className = 'cifra';
    hora.textContent = formatDate(momento);
    currentRecordingEl.append(punto, nombre, hora);
    if (extra) {
        let resto = document.createElement('span');
        resto.className = 'texto-2';
        resto.textContent = extra;
        currentRecordingEl.appendChild(resto);
    }
}

/**
 * Muestra solo el campo de tiempo correspondiente al modo de inicio elegido.
 */
function actualizarModoPlayback() {
    let mode = playbackModeEl.value;
    document.getElementById('lookbackField').hidden = mode !== 'lookback';
    document.getElementById('offsetField').hidden = mode !== 'offset';
    document.getElementById('specificField').hidden = mode !== 'specific';

    // La línea temporal sigue siendo el buscador de momentos en cualquier modo.
    timelineSlider.disabled = !selectedRecording;

    guardarPreferencias();
}

/**
 * Handlers de los desplegables (los invoca el HTML sin argumentos): una elección
 * manual nunca conserva el estado anterior, siempre parte de lo elegido.
 */
function cambiarStream() {
    poblarGrabaciones();
    pintarColorStream();

    // El sondeo rápido sigue al stream elegido (playback.js).
    if (typeof refrescarStreamSeleccionado === 'function') refrescarStreamSeleccionado();

    // El botón de marcar rotula el stream destino (playback-marcados.js).
    if (typeof actualizarEtiquetaMarcar === 'function') actualizarEtiquetaMarcar();
}

function cambiarGrabacion() {
    seleccionarGrabacion();
}

function pintarColorStream() {
    aplicarColorCamara(streamSelectEl, streamSelectEl.value);
    streamSelectEl.classList.toggle('con-camara', Boolean(streamSelectEl.value));
}

/**
 * Muestra junto al botón de envío qué repetición se mandaría al display.
 * Refleja `ultimaSeleccion` (lo último que se previsualizó), NO lo marcado en
 * los desplegables: el envío manda lo reproducido, no lo seleccionado.
 */
function actualizarPendienteEnvio() {
    if (!obsPendingEl) return;

    if (!ultimaSeleccion) {
        obsPendingEl.textContent = 'Reproduce algo primero: se envía lo que estés previsualizando.';
        obsPendingEl.classList.remove('listo');
        return;
    }

    obsPendingEl.textContent = `Se enviará ${ultimaSeleccion.label}`;
    obsPendingEl.classList.add('listo');
}

/**
 * Rellena el dropdown de streams con los presentes en las grabaciones.
 * @param {Object} [opciones]
 * @param {boolean} [opciones.preservarSeleccion] - Mantener el stream elegido si
 *   sigue existiendo (refresco automático); si no, se aplica el guardado.
 */
function poblarStreams({ preservarSeleccion = false } = {}) {
    let streams = [...new Set(allRecordings.map(r => r.stream))].sort();

    // Qué stream hay que dejar marcado tras repintar: el que estaba en pantalla
    // (refresco) o el que se recordó de la sesión anterior (carga inicial).
    let deseado = preservarSeleccion
        ? streamSelectEl.value
        : (leerPreferencias() || {}).stream;

    streamSelectEl.innerHTML = '';
    streams.forEach(stream => {
        let option = document.createElement('option');
        option.value = stream;
        option.textContent = stream;
        streamSelectEl.appendChild(option);
    });

    if (streams.length === 0) {
        recordingSelectEl.innerHTML = '';
        selectedRecording = null;
        firmaPintada = firmaGrabaciones(allRecordings);
        pintarColorStream();
        return;
    }

    // Si el stream deseado ya no existe, el <select> se queda en el primero.
    if (deseado && streams.includes(deseado)) {
        streamSelectEl.value = deseado;
    }
    pintarColorStream();

    poblarGrabaciones({ preservarSeleccion });
    firmaPintada = firmaGrabaciones(allRecordings);
}

/**
 * Rellena el dropdown de grabaciones con los segmentos del stream seleccionado
 * (más recientes primero).
 * @param {Object} [opciones]
 * @param {boolean} [opciones.preservarSeleccion] - Mantener la grabación elegida
 *   si sigue existiendo; si no, cae en la más reciente.
 */
function poblarGrabaciones({ preservarSeleccion = false } = {}) {
    let stream = streamSelectEl.value;
    // allRecordings ya viene ordenado por fecha descendente, así que el primero
    // de este stream es el segmento "vivo" / más reciente.
    let segmentos = allRecordings.filter(r => r.stream === stream);

    let deseado = preservarSeleccion
        ? recordingSelectEl.value
        : (leerPreferencias() || {}).grabacion;

    recordingSelectEl.innerHTML = '';
    segmentos.forEach((recording, i) => {
        let option = document.createElement('option');
        option.value = recording.startISO;
        let etiqueta = `${formatDate(recording.start)} (${formatDuration(recording.duration)})`;
        option.textContent = i === 0 ? `${etiqueta}, la última` : etiqueta;
        recordingSelectEl.appendChild(option);
    });

    if (deseado && segmentos.some(r => r.startISO === deseado)) {
        recordingSelectEl.value = deseado;
    }

    seleccionarGrabacion({ conservarOffset: preservarSeleccion });
}

/**
 * Fija como seleccionada la grabación marcada en el dropdown y prepara la
 * línea temporal (sin reproducir todavía).
 * @param {Object} [opciones]
 * @param {boolean} [opciones.conservarOffset] - No resetear el punto elegido en
 *   la línea temporal (refresco automático).
 */
function seleccionarGrabacion({ conservarOffset = false } = {}) {
    let startISO = recordingSelectEl.value;
    let anterior = selectedRecording;
    selectedRecording = allRecordings.find(
        r => r.stream === streamSelectEl.value && r.startISO === startISO
    ) || null;

    if (!selectedRecording) {
        timelineSlider.value = 0;
        timelineSlider.disabled = true;
        timelineStart.textContent = '--:--:--';
        timelineEnd.textContent = '--:--:--';
        if (!ultimaSeleccion) currentRecordingEl.textContent = 'Sin selección';
        actualizarBurbujaTimeline();
        guardarPreferencias();
        return;
    }

    // Se preserva el MOMENTO apuntado, no la posición del slider: la escala es
    // logarítmica sobre "hace cuánto", así que la posición de un mismo instante
    // se desplaza a cada segundo que pasa.
    let mismoSegmento = anterior
        && anterior.stream === selectedRecording.stream
        && anterior.startISO === selectedRecording.startISO;
    let momentoPrevio = (conservarOffset && mismoSegmento) ? momentoDeTimeline() : null;

    let startDate = new Date(selectedRecording.start);
    let duracion = Math.floor(selectedRecording.duration);
    startOffsetInput.max = duracion;
    timelineSlider.disabled = false;

    if (momentoPrevio) {
        situarTimelineEn(momentoPrevio);
    } else {
        // Sin punto previo: arrancar en el borde vivo, que es de donde se pincha.
        timelineSlider.value = TIMELINE_PASOS;
        startOffsetInput.value = duracion;
    }

    // Extremos: el inicio de la grabación y el "ahora".
    timelineStart.textContent = formatTimeOnly(startDate);
    timelineEnd.textContent = formatTimeOnly(new Date());

    // En el refresco automático el rótulo lo gestiona la reproducción en curso.
    if (!conservarOffset && !ultimaSeleccion) {
        pintarRotuloActual(selectedRecording.stream, startDate);
    }

    actualizarBurbujaTimeline();
    guardarPreferencias();
}

/**
 * Antigüedad (en segundos) del punto más viejo de la grabación seleccionada:
 * el extremo izquierdo de la línea temporal.
 * @returns {number}
 */
function antiguedadMaxima() {
    if (!selectedRecording) return TIMELINE_ANTIGUEDAD_MIN_S + 1;
    return (Date.now() - new Date(selectedRecording.start).getTime()) / 1000;
}

/**
 * Instante real al que apunta ahora mismo la línea temporal.
 * @returns {Date}
 */
function momentoDeTimeline() {
    let posicion = parseFloat(timelineSlider.value) || 0;
    let antiguedad = posicionAAntiguedad(posicion, antiguedadMaxima());
    let momento = new Date(Date.now() - antiguedad * 1000);

    // Con grabaciones más cortas que el ancla, el extremo izquierdo de la escala
    // apunta más atrás de lo que existe: no salirse del inicio del segmento.
    let inicio = selectedRecording ? new Date(selectedRecording.start) : null;
    return (inicio && momento < inicio) ? inicio : momento;
}

/**
 * Coloca la línea temporal sobre un instante dado.
 * @param {Date} momento
 */
function situarTimelineEn(momento) {
    let antiguedad = (Date.now() - momento.getTime()) / 1000;
    timelineSlider.value = antiguedadAPosicion(antiguedad, antiguedadMaxima());
}

/**
 * Actualiza la burbuja con la hora real del punto apuntado y la sitúa sobre el thumb.
 */
function actualizarBurbujaTimeline() {
    if (!selectedRecording || timelineSlider.disabled) {
        timelineBubble.classList.remove('visible');
        return;
    }

    timelineBubble.textContent = formatTimeOnly(momentoDeTimeline());

    let fraccion = (parseFloat(timelineSlider.value) || 0) / TIMELINE_PASOS;
    const anchoThumb = 16;
    let x = fraccion * (timelineSlider.offsetWidth - anchoThumb) + anchoThumb / 2;
    timelineBubble.style.left = `${x}px`;
    timelineBubble.classList.add('visible');
}

/**
 * Refleja en el panel el punto donde está la línea temporal, alimentando el
 * campo del modo activo (no arrastra al usuario a otro modo salvo que el
 * punto quede fuera del alcance de "hace N segundos").
 */
function actualizarPuntoSeleccionado() {
    if (!selectedRecording) return;

    let momento = momentoDeTimeline();
    let hace = Math.round((Date.now() - momento.getTime()) / 1000);
    let offset = (momento.getTime() - new Date(selectedRecording.start).getTime()) / 1000;

    let mode = playbackModeEl.value;

    if (mode === 'lookback') {
        if (hace <= SEGUNDOS_ATRAS_MAX) {
            fijarSegundosAtras(Math.max(hace, SEGUNDOS_ATRAS_MIN));
        } else if (!ajustandoTimeline) {
            // Más atrás de lo que "hace N segundos" alcanza: se pasa a "hora
            // concreta", solo al SOLTAR (no a mitad de gesto).
            playbackModeEl.value = 'specific';
            actualizarModoPlayback();
            specificTimeInput.value = formatTimeOnly(momento);
        }
    } else if (mode === 'specific') {
        specificTimeInput.value = formatTimeOnly(momento);
    } else {
        startOffsetInput.value = Math.max(0, Math.round(offset));
    }

    pintarRotuloActual(selectedRecording.stream, momento, hace > 0 ? `hace ${formatDuration(hace)}` : '');

    guardarPreferencias();
}

// Límites de "mirar hacia atrás" (los del slider; el numérico los respeta).
const SEGUNDOS_ATRAS_MIN = 10;
const SEGUNDOS_ATRAS_MAX = 300;

/**
 * Segundos hacia atrás pedidos, acotados al rango del control.
 * @returns {number}
 */
function segundosAtras() {
    let valor = parseInt(lookbackTimeInput.value, 10);
    if (isNaN(valor)) return SEGUNDOS_ATRAS_MIN;
    return Math.min(SEGUNDOS_ATRAS_MAX, Math.max(SEGUNDOS_ATRAS_MIN, valor));
}

/**
 * Refleja los segundos en la etiqueta ("30 seg", "2 min 30 seg").
 * @param {number} segundos
 */
function pintarEtiquetaAtras(segundos) {
    if (segundos < 60) {
        lookbackValueEl.textContent = `${segundos} seg`;
        return;
    }

    let minutos = Math.floor(segundos / 60);
    let resto = segundos % 60;
    lookbackValueEl.textContent = resto === 0 ? `${minutos} min` : `${minutos} min ${resto} seg`;
}

/**
 * Fija los segundos hacia atrás en los DOS controles y en la etiqueta.
 * @param {number} segundos
 */
function fijarSegundosAtras(segundos) {
    let valor = Math.min(SEGUNDOS_ATRAS_MAX, Math.max(SEGUNDOS_ATRAS_MIN, segundos));
    lookbackTimeInput.value = valor;
    lookbackSlider.value = valor;
    pintarEtiquetaAtras(valor);

    if (typeof actualizarEtiquetaMarcar === 'function') actualizarEtiquetaMarcar();

    guardarPreferencias();
}

/**
 * El usuario movió el slider: arrastra el campo numérico.
 */
function sincronizarDesdeSlider() {
    fijarSegundosAtras(parseInt(lookbackSlider.value, 10));
}

/**
 * El usuario escribió en el campo numérico: arrastra el slider.
 * No se corrige el texto mientras teclea; solo se acota el slider.
 */
function sincronizarDesdeNumero() {
    let crudo = parseInt(lookbackTimeInput.value, 10);
    if (isNaN(crudo)) return; // Campo vacío a mitad de edición: esperar

    let valor = Math.min(SEGUNDOS_ATRAS_MAX, Math.max(SEGUNDOS_ATRAS_MIN, crudo));
    lookbackSlider.value = valor;
    pintarEtiquetaAtras(valor);

    if (typeof actualizarEtiquetaMarcar === 'function') actualizarEtiquetaMarcar();

    guardarPreferencias();
}


// VELOCIDAD Y TIEMPO
/**
 * Ajusta la velocidad de reproducción. defaultPlaybackRate hace que se
 * mantenga al encadenar el tramo siguiente (cada tramo recarga el vídeo).
 * @param {number} speed - Velocidad deseada.
 */
function fijarVelocidad(speed) {
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
    pintarVelocidad();
}

/**
 * Incrementa o reduce la velocidad actual manteniéndola entre 0,25× y 4×.
 * @param {number} delta - Variación de velocidad.
 */
function cambiarVelocidad(delta) {
    let newSpeed = Math.max(0.25, Math.min(4, Math.round((video.playbackRate + delta) * 100) / 100));
    fijarVelocidad(newSpeed);
}

function pintarVelocidad() {
    speedDisplay.textContent = `${video.playbackRate.toLocaleString('es-ES', { maximumFractionDigits: 2 })}×`;
}

/**
 * Actualiza la etiqueta con el tiempo transcurrido y total del tramo.
 */
function actualizarTiempoMostrado() {
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}


// Eventos del vídeo
video.addEventListener('timeupdate', actualizarTiempoMostrado);
video.addEventListener('loadedmetadata', actualizarTiempoMostrado);
video.addEventListener('ratechange', pintarVelocidad);

video.addEventListener('error', () => {
    console.error('Error al cargar el video:', video.error);
    let error = video.error;
    let mensaje = 'Error desconocido al cargar el vídeo';

    if (error) {
        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                mensaje = 'Carga del vídeo abortada';
                break;
            case error.MEDIA_ERR_NETWORK:
                mensaje = 'Error de red al cargar el vídeo';
                break;
            case error.MEDIA_ERR_DECODE:
                mensaje = 'Error de decodificación del vídeo';
                break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                mensaje = 'Segmento no disponible o códec no compatible con el navegador (emite en H264)';
                break;
        }
    }

    setEstado(`${mensaje}. Si la grabación es muy reciente, espera unos segundos.`, 'error');
});

// Mientras se manipula la línea temporal (ratón o teclado) se congela el
// refresco automático: si no, repintaría el slider y movería el punto buscado.
['pointerdown', 'focus'].forEach(evento => {
    timelineSlider.addEventListener(evento, () => { ajustandoTimeline = true; });
});

// Arrastrar la línea temporal es la forma de BUSCAR un momento.
timelineSlider.addEventListener('input', () => {
    actualizarBurbujaTimeline();
    actualizarPuntoSeleccionado();
});

// Al soltar se reevalúa el punto FINAL con la bandera ya bajada.
['pointerup', 'pointercancel', 'blur'].forEach(evento => {
    timelineSlider.addEventListener(evento, () => {
        ajustandoTimeline = false;
        actualizarPuntoSeleccionado();
    });
});

// Escribir los segundos desde el inicio mueve la línea temporal a ese instante.
// (La barra es logarítmica: se convierte el instante a posición, no se copia el número.)
startOffsetInput.addEventListener('input', () => {
    if (!selectedRecording) return;
    let segundos = Math.max(0, parseFloat(startOffsetInput.value) || 0);
    situarTimelineEn(new Date(new Date(selectedRecording.start).getTime() + segundos * 1000));
    actualizarBurbujaTimeline();
    guardarPreferencias();
});

// Al salir del campo numérico sí se normaliza.
lookbackTimeInput.addEventListener('change', () => fijarSegundosAtras(segundosAtras()));
specificTimeInput.addEventListener('change', guardarPreferencias);

// Reposicionar la burbuja si cambia el tamaño de la ventana.
window.addEventListener('resize', actualizarBurbujaTimeline);

window.addEventListener('load', async () => {
    // Todo el arranque va en modo "restaurando": poblarStreams/poblarGrabaciones
    // leen las preferencias, y hasta que no terminan no se vuelve a guardar nada.
    restaurando = true;
    try {
        restaurarControles();
        actualizarModoPlayback();
        pintarVelocidad();
        await loadRecordings();
    } finally {
        restaurando = false;
    }

    guardarPreferencias();
    actualizarPendienteEnvio();
    iniciarRefrescoAutomatico();
});
