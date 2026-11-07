/**
 * NUCLEO DEL REPRODUCTOR DE GRABACIONES
 * Gestiona la consulta y reproducción de segmentos grabados.
 */

// Margen (s) que dejamos sin pedir junto al borde "vivo": los últimos segundos
// pueden no estar volcados a disco todavía (ver recordPartDuration en mediamtx.yml).
const MARGEN_FIN_VIVO_S = 4;

// Sondeo de la lista: el stream seleccionado cada segundo (su segmento vivo
// crece en tiempo real) y la lista completa de cámaras cada 10 s. Antes se
// pedían todas las cámaras cada segundo (N+1 peticiones/s).
const INTERVALO_REFRESCO_MS = 1000;
const INTERVALO_LISTA_COMPLETA_MS = 10000;
let ultimaListaCompleta = 0;

// Última repetición reproducida (url + offset + etiqueta); la usa el control de
// OBS (playback-control.js) para enviar al display justo lo que se previsualizó.
let ultimaSeleccion = null;

// Evita solapar peticiones si MediaMTX tarda más de un tick en responder.
let refrescoEnCurso = false;

// CONTINUACIÓN DE LA REPETICIÓN
// El playback server corta la petición en el borde vivo: pidas la duración que
// pidas, solo sirve lo que ya estaba grabado. Para que una repetición no se
// pare, al terminar un tramo se pide el siguiente desde donde acabó.

// Reproducción en curso; sube a cada nueva repetición para que los tramos de una
// anterior (con peticiones en vuelo) no se encadenen encima de la actual.
let sesionReproduccion = 0;

// Instante real en el que termina el tramo que se está viendo: de ahí arranca el siguiente.
let finDelTramo = null;
// Instante real que corresponde al segundo 0 del vídeo cargado ahora mismo.
let inicioTramo = null;
let streamEnCurso = null;

// Si al pedir el tramo siguiente aún no hay material nuevo, se reintenta.
const REINTENTO_CONTINUACION_MS = 1000;

// construirUrlProxyPlayback, consultarSegmentos, ordenarGrabaciones y
// consultarTodasLasGrabaciones viven en js/utils/grabaciones.js.

/**
 * Lista completa de grabaciones (todas las cámaras).
 * @returns {Promise<Array>} De más reciente a más antigua.
 */
async function consultarGrabaciones() {
    let lista = await consultarTodasLasGrabaciones();
    ultimaListaCompleta = Date.now();
    return lista;
}

/**
 * Refresco rápido: solo los segmentos del stream seleccionado.
 * @returns {Promise<Array>} Lista completa con ese stream actualizado.
 */
async function consultarStreamSeleccionado() {
    let stream = streamSelectEl.value;
    if (!stream) return consultarGrabaciones();
    let segmentos = await consultarSegmentos(stream);
    return ordenarGrabaciones(allRecordings.filter(r => r.stream !== stream).concat(segmentos));
}

/**
 * Carga las grabaciones disponibles.
 * @param {Object} [opciones]
 * @param {boolean} [opciones.silencioso] - Refresco automático: no pisa los
 *   mensajes de estado ni repinta los desplegables si la lista no ha cambiado.
 * @param {boolean} [opciones.completa] - Consultar todos los streams (si no, solo el seleccionado).
 */
async function loadRecordings({ silencioso = false, completa = true } = {}) {
    if (refrescoEnCurso) return; // Un tick anterior sigue en vuelo: dejarle terminar
    refrescoEnCurso = true;

    try {
        if (!silencioso) recordingCountEl.textContent = 'Cargando…';

        let grabaciones = completa ? await consultarGrabaciones() : await consultarStreamSeleccionado();

        // En un refresco automático, repintar solo si algo cambió de verdad.
        if (silencioso && !haCambiadoLaLista(grabaciones)) {
            allRecordings = grabaciones;
            return;
        }

        allRecordings = grabaciones;
        poblarStreams({ preservarSeleccion: silencioso });

        // Sin grabaciones, el recuento lo dice; aparecerán solas con el refresco automático
        let total = allRecordings.length;
        recordingCountEl.textContent = total === 0
            ? 'Ninguna grabación todavía'
            : `${total} ${total === 1 ? 'grabación' : 'grabaciones'}`;
    } catch (error) {
        console.error('Error al cargar grabaciones:', error);
        if (!silencioso) {
            recordingCountEl.textContent = 'Sin datos';
            avisarError(`No se pudieron cargar las grabaciones (${error.message}). Comprueba que MediaMTX está en marcha.`);
        }
    } finally {
        refrescoEnCurso = false;
    }
}

/**
 * Refresco inmediato del stream recién elegido (lo llama la UI al cambiarlo).
 */
function refrescarStreamSeleccionado() {
    loadRecordings({ silencioso: true, completa: false });
}

/**
 * Arranca el refresco periódico de la lista. Se salta los ticks en los que
 * repintar sería contraproducente: pestaña oculta, desplegable abierto o
 * línea temporal en uso.
 */
function iniciarRefrescoAutomatico() {
    setInterval(() => {
        if (document.hidden) return;
        if (hayDesplegableAbierto()) return;
        if (ajustandoTimeline) return;
        let completa = Date.now() - ultimaListaCompleta >= INTERVALO_LISTA_COMPLETA_MS;
        loadRecordings({ silencioso: true, completa });
    }, INTERVALO_REFRESCO_MS);
}

/**
 * Arranca el vídeo en la URL dada y deja registrada la repetición para el display.
 * Las URLs de este reproductor empiezan siempre en el instante pedido (start),
 * así que no hay que saltar dentro del vídeo: seekOffset es 0 salvo URLs ajenas.
 * @param {string} playURL - URL del proxy de playback.
 * @param {number} seekOffset - Segundos a los que saltar dentro del vídeo cargado.
 * @param {string} stream - Path del stream reproducido.
 * @param {Date} momento - Instante real del contenido que empieza a verse.
 */
function lanzarReproduccion(playURL, seekOffset, stream, momento) {
    // Nueva repetición: invalida los tramos pendientes de la anterior.
    sesionReproduccion++;
    streamEnCurso = stream;
    finDelTramo = null;
    // Instante real que corresponde a t=0 del vídeo cargado
    inicioTramo = new Date(momento.getTime() - seekOffset * 1000);

    if (seekOffset > 0) {
        const onLoadedMetadata = () => {
            try {
                video.currentTime = seekOffset;
            } catch (error) {
                console.warn('No se pudo aplicar seek inicial:', error);
            }
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
        video.addEventListener('loadedmetadata', onLoadedMetadata);
    }

    // Limpiar reproducción previa para evitar AbortError al cambiar rápidamente de segmento.
    video.pause();
    video.removeAttribute('src');
    video.load();

    video.src = playURL;
    video.load();
    video.play().catch(err => {
        if (err && err.name === 'AbortError') return;
        console.error('Error al reproducir:', err);
        avisarError('No se pudo iniciar la reproducción. El tramo puede no estar grabado todavía.');
    });

    // Rótulo y etiqueta: el instante REAL reproducido, no el inicio del fichero.
    pintarRotuloActual(stream, momento);

    ultimaSeleccion = {
        url: playURL,
        seekOffset: seekOffset,
        label: `${stream} a las ${formatTimeOnly(momento)}`
    };

    actualizarPendienteEnvio();
}

/**
 * Encadena el tramo siguiente: continúa la repetición desde donde acabó la
 * anterior, para que no se detenga al alcanzar el borde vivo de cuando se pidió.
 * @param {number} sesion - Sesión que pidió la continuación (descarta las viejas).
 */
async function continuarRepeticion(sesion) {
    if (sesion !== sesionReproduccion) return;
    if (!finDelTramo || !streamEnCurso) return;

    // Solo se puede continuar hasta donde el directo ya haya grabado.
    let disponible = (Date.now() - MARGEN_FIN_VIVO_S * 1000 - finDelTramo.getTime()) / 1000;

    if (disponible < 1) {
        // La repetición ha alcanzado el directo: esperar a que se grabe más.
        setTimeout(() => continuarRepeticion(sesion), REINTENTO_CONTINUACION_MS);
        return;
    }

    let inicio = finDelTramo;
    let playURL = `/api/playback/get?duration=${encodeURIComponent(disponible)}`
        + `&path=${encodeURIComponent(streamEnCurso)}`
        + `&start=${encodeURIComponent(inicio.toISOString())}`;

    inicioTramo = inicio;
    finDelTramo = null;
    video.src = playURL;
    video.load();
    video.play().catch(err => {
        if (err && err.name === 'AbortError') return;
        console.warn('No se pudo continuar la repetición:', err);
    });
}

// Al acabarse un tramo no se para: se pide el siguiente y se sigue.
// El fin del tramo se calcula AQUÍ y no en loadedmetadata: el fMP4 llega en
// streaming y video.duration crece mientras se descarga (en loadedmetadata
// solo vale lo que haya llegado, ~1 s), así que solo al terminar es la real.
video.addEventListener('ended', () => {
    if (inicioTramo && isFinite(video.duration)) {
        finDelTramo = new Date(inicioTramo.getTime() + video.duration * 1000);
    }
    continuarRepeticion(sesionReproduccion);
});

/**
 * Modo "hace unos segundos": los últimos N segundos del stream, calculados
 * contra el RELOJ, no contra el segmento seleccionado. El playback server cose
 * los segmentos, así que sigue al directo aunque el desplegable esté en otro.
 * @param {number} segundos - Cuántos segundos mirar hacia atrás desde ahora.
 */
function reproducirHaciaAtras(segundos) {
    let stream = streamSelectEl.value;
    if (!stream) {
        avisarError('No hay ninguna cámara grabada todavía');
        return;
    }

    // Terminar un poco antes de "ahora": los últimos segundos pueden no estar en disco.
    let inicio = new Date(Date.now() - segundos * 1000);
    let duracion = segundos - MARGEN_FIN_VIVO_S;

    if (duracion <= 0) {
        avisarError(`La repetición debe ser de más de ${MARGEN_FIN_VIVO_S} segundos`);
        return;
    }

    let playURL = `/api/playback/get?duration=${encodeURIComponent(duracion)}`
        + `&path=${encodeURIComponent(stream)}`
        + `&start=${encodeURIComponent(inicio.toISOString())}`;

    // La URL ya empieza en el momento pedido: no hay que saltar dentro del vídeo.
    lanzarReproduccion(playURL, 0, stream, inicio);
}

/**
 * Atajo: fija los segundos hacia atrás y reproduce de inmediato.
 * @param {number} segundos - Segundos hacia atrás.
 */
function repetirAtajo(segundos) {
    playbackModeEl.value = 'lookback';
    actualizarModoPlayback();
    fijarSegundosAtras(segundos);
    reproducirHaciaAtras(segundos);
}

/**
 * Calcula la ventana temporal a reproducir y lanza el vídeo.
 */
function playFromOffset() {
    let mode = playbackModeEl.value;

    if (mode === 'lookback') {
        reproducirHaciaAtras(segundosAtras());
        return;
    }

    if (!selectedRecording) {
        avisarError('Elige una grabación primero');
        return;
    }

    let offset = 0;
    let newDuration = selectedRecording.duration;

    if (mode === 'offset') {
        offset = parseFloat(startOffsetInput.value) || 0;
        newDuration = selectedRecording.duration - offset;

        if (offset > selectedRecording.duration) {
            avisarError(`El segundo ${offset} queda fuera: la grabación dura ${formatDuration(selectedRecording.duration)}`);
            return;
        }
    } else if (mode === 'specific') {
        let timeValue = specificTimeInput.value.trim();
        let match = timeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) {
            avisarError('Escribe la hora como HH:MM o HH:MM:SS');
            return;
        }

        let hh = parseInt(match[1], 10);
        let mm = parseInt(match[2], 10);
        let ss = match[3] ? parseInt(match[3], 10) : 0;

        if (hh > 23 || mm > 59 || ss > 59) {
            avisarError('Esa hora no existe: usa HH:MM o HH:MM:SS, con horas de 0 a 23 y minutos y segundos de 0 a 59');
            return;
        }

        let recordingStart = new Date(selectedRecording.start);
        let recordingEnd = new Date(recordingStart.getTime() + selectedRecording.duration * 1000);

        // La hora específica en la misma fecha que la grabación
        let specificDate = new Date(recordingStart);
        specificDate.setHours(hh, mm, ss, 0);

        if (specificDate < recordingStart || specificDate > recordingEnd) {
            avisarError(`Esa hora no está en la grabación elegida (de ${formatTimeOnly(recordingStart)} a ${formatTimeOnly(recordingEnd)})`);
            return;
        }

        offset = (specificDate.getTime() - recordingStart.getTime()) / 1000;
        newDuration = (recordingEnd.getTime() - specificDate.getTime()) / 1000;
    }

    if (newDuration <= 0) {
        avisarError('No queda contenido desde ese punto');
        return;
    }

    // Instante real donde empieza la reproducción = inicio del segmento + offset.
    let recordingStart = new Date(selectedRecording.start);
    let newStartDate = new Date(recordingStart.getTime() + offset * 1000);

    // Reproducción íntegra del segmento: sirve la URL que ya dio MediaMTX. En
    // cualquier otro caso se reconstruye con start = instante pedido.
    let intacto = (offset === 0 && newDuration === selectedRecording.duration);
    let playURL = intacto ? construirUrlProxyPlayback(selectedRecording.url) : null;

    if (!playURL) {
        playURL = `/api/playback/get?duration=${encodeURIComponent(newDuration)}`
            + `&path=${encodeURIComponent(selectedRecording.stream)}`
            + `&start=${encodeURIComponent(newStartDate.toISOString())}`;
    }

    // El vídeo servido ya empieza en newStartDate (su t=0): NO se vuelve a
    // saltar el offset dentro de él (antes se aplicaba dos veces).
    lanzarReproduccion(playURL, 0, selectedRecording.stream, newStartDate);
}
