/**
 * ARCHIVO DE GRABACIONES
 * Tomas de cada cámara (de que empieza a emitir a que para) con filtros,
 * visor, envío a OBS desde un instante, descarga en MP4 y borrado.
 */

const MIN_TOMA_S = 10;                    // "Ocultar tomas de menos de 10 s"
const MARGEN_VIVO_ARCHIVO_S = 4;          // Lo último puede no estar en disco aún
const TOLERANCIA_DIRECTO_MS = 15000;      // Fin tan reciente = sigue grabando
const REFRESCO_ARCHIVO_MS = 5000;
const CLAVE_FILTROS_ARCHIVO = 'archivo_filtros';

let todasLasTomas = [];
let tomaElegida = null;
let idsEnDirecto = new Set();
let firmaListaPintada = '';
let firmaChipsPintados = '';
let cargaEnCurso = false;
let arrastrandoPosicion = false;

// Instante real del segundo 0 del vídeo cargado en el visor
let inicioVideoVisor = null;

let filtrosArchivo = { camaras: [], fecha: 'todo', ocultarCortas: true, orden: 'recientes' };

function buscarToma(id) {
    return todasLasTomas.find(t => idToma(t) === id) || null;
}

/**
 * Inicio para una URL de playback: en el arranque de la toma, su ISO exacto
 * (ver urlPlayback); más adentro, el Date basta.
 */
function inicioParaUrl(toma, instante) {
    return instante.getTime() - toma.start.getTime() < 1 ? toma.startISO : instante;
}

// FILTROS
function leerFiltrosGuardados() {
    try {
        let guardados = JSON.parse(localStorage.getItem(CLAVE_FILTROS_ARCHIVO) || 'null');
        if (guardados && typeof guardados === 'object') filtrosArchivo = { ...filtrosArchivo, ...guardados };
    } catch {
        // Sin almacenamiento: filtros por defecto
    }
    filtroFechaEl.value = filtrosArchivo.fecha;
    ordenTomasEl.value = filtrosArchivo.orden;
    filtroCortasEl.checked = filtrosArchivo.ocultarCortas;
}

function guardarFiltros() {
    try {
        localStorage.setItem(CLAVE_FILTROS_ARCHIVO, JSON.stringify(filtrosArchivo));
    } catch {
        // No pasa nada: solo no se recordarán
    }
}

function cambiarFiltros() {
    filtrosArchivo.fecha = filtroFechaEl.value;
    filtrosArchivo.orden = ordenTomasEl.value;
    filtrosArchivo.ocultarCortas = filtroCortasEl.checked;
    guardarFiltros();
    repintarLista(true);
}

function alternarCamara(nombre) {
    let i = filtrosArchivo.camaras.indexOf(nombre);
    if (i >= 0) filtrosArchivo.camaras.splice(i, 1);
    else filtrosArchivo.camaras.push(nombre);
    guardarFiltros();
    repintarLista(true);
}

function elegirTodasLasCamaras() {
    filtrosArchivo.camaras = [];
    guardarFiltros();
    repintarLista(true);
}

/** Tomas que pasan los filtros, en el orden elegido. */
function tomasFiltradas() {
    let ahora = new Date();
    let hoy = inicioDelDia(ahora);
    let ayer = new Date(hoy.getTime() - 86400000);
    let semana = new Date(ahora.getTime() - 7 * 86400000);
    let { camaras, fecha, ocultarCortas, orden } = filtrosArchivo;

    let lista = todasLasTomas.filter(t => {
        if (camaras.length && !camaras.includes(t.stream)) return false;
        // Una toma en directo no se oculta aunque aún sea corta
        if (ocultarCortas && t.duration < MIN_TOMA_S && !idsEnDirecto.has(idToma(t))) return false;
        if (fecha === 'hoy') return t.start >= hoy;
        if (fecha === 'ayer') return t.start >= ayer && t.start < hoy;
        if (fecha === '7d') return t.start >= semana;
        return true;
    });

    if (orden === 'antiguas') lista.sort((a, b) => a.start - b.start);
    else if (orden === 'largas') lista.sort((a, b) => b.duration - a.duration);
    else lista.sort((a, b) => b.start - a.start);
    return lista;
}

/**
 * Repinta la lista. Si solo han cambiado duraciones (tomas en directo que
 * crecen), actualiza en sitio para no perder foco ni scroll.
 * @param {boolean} forzar - Cambio de filtros: repintar siempre.
 */
function repintarLista(forzar = false) {
    let camaras = [...new Set(todasLasTomas.map(t => t.stream))].sort();
    // Cámaras marcadas que ya no tienen grabaciones: fuera del filtro
    filtrosArchivo.camaras = filtrosArchivo.camaras.filter(c => camaras.includes(c));
    let firmaChips = camaras.join(',') + '|' + filtrosArchivo.camaras.join(',');
    if (firmaChips !== firmaChipsPintados) {
        firmaChipsPintados = firmaChips;
        pintarChipsCamaras(camaras, filtrosArchivo.camaras);
    }

    let lista = tomasFiltradas();
    let firma = lista.map(t => `${idToma(t)}${idsEnDirecto.has(idToma(t)) ? '*' : ''}`).join(',') + filtrosArchivo.orden;
    if (!forzar && firma === firmaListaPintada) {
        actualizarTomasEnSitio(lista, idsEnDirecto);
    } else {
        firmaListaPintada = firma;
        pintarTomas(lista, {
            agrupar: filtrosArchivo.orden !== 'largas',
            enDirecto: idsEnDirecto,
            elegida: tomaElegida ? idToma(tomaElegida) : null,
            total: todasLasTomas.length
        });
    }
    marcarTomaEnObs(idTomaEnObs());
}

// DATOS
/** Una toma sigue en directo si es la última de una cámara que emite y acaba "ahora". */
function calcularEnDirecto(paths) {
    let ultimas = new Map();
    todasLasTomas.forEach(t => {
        let previa = ultimas.get(t.stream);
        if (!previa || t.start > previa.start) ultimas.set(t.stream, t);
    });
    let ahora = Date.now();
    idsEnDirecto = new Set([...ultimas.values()]
        .filter(t => paths.has(t.stream) && ahora - finToma(t).getTime() < TOLERANCIA_DIRECTO_MS)
        .map(idToma));
}

async function cargarTomas({ silencioso = false } = {}) {
    if (cargaEnCurso) return;
    cargaEnCurso = true;
    try {
        let [tomas, paths] = await Promise.all([consultarTodasLasGrabaciones(), pathsEnDirecto().catch(() => new Set())]);
        todasLasTomas = tomas;
        calcularEnDirecto(paths);
        repintarLista(!silencioso);

        // La toma elegida puede haber crecido (directo) o desaparecido (borrada)
        if (tomaElegida) {
            let actual = buscarToma(idToma(tomaElegida));
            if (actual) {
                tomaElegida = actual;
                if (!arrastrandoPosicion) pintarVisor(actual, idsEnDirecto.has(idToma(actual)));
            } else {
                soltarToma();
            }
        }
    } catch (error) {
        console.error('Error al cargar el archivo:', error);
        recuentoTomasEl.textContent = 'Sin datos';
        if (!silencioso) mostrarAviso(`No se pudieron cargar las grabaciones (${error.message}). Comprueba que MediaMTX está en marcha.`, 'error');
    } finally {
        cargaEnCurso = false;
    }
}

// VISOR
function elegirToma(id) {
    let toma = buscarToma(id);
    if (!toma) return;
    tomaElegida = toma;
    marcarTomaElegida(id);
    pintarVisor(toma, idsEnDirecto.has(id));
    visorVideo.poster = miniaturasEnMemoria.get(id) || '';
    visorPosicionEl.value = '0';
    cargarDesde(0, { reproducir: false });
    // En móvil el visor va encima de la lista: llevarlo a la vista
    if (window.matchMedia('(max-width: 900px)').matches) visorEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function soltarToma() {
    tomaElegida = null;
    inicioVideoVisor = null;
    visorVideo.removeAttribute('src');
    visorVideo.removeAttribute('poster');
    visorVideo.load();
    marcarTomaElegida(null);
    pintarVisor(null, false);
    pintarBotonesInstante(null);
}

/** Segundos de la toma que se pueden pedir desde `segundo`. */
function disponibleDesde(toma, segundo) {
    if (idsEnDirecto.has(idToma(toma))) {
        return (Date.now() - MARGEN_VIVO_ARCHIVO_S * 1000 - toma.start.getTime()) / 1000 - segundo;
    }
    return toma.duration - segundo;
}

/**
 * Carga la toma elegida desde un segundo. El vídeo servido empieza en ese
 * instante (t=0): no se salta dentro de él.
 */
function cargarDesde(segundo, { reproducir = true } = {}) {
    let toma = tomaElegida;
    if (!toma) return;
    segundo = Math.max(0, Math.min(segundo, Math.floor(toma.duration)));
    let disponible = disponibleDesde(toma, segundo);
    if (disponible < 1) {
        segundo = Math.max(0, segundo - 2);
        disponible = disponibleDesde(toma, segundo);
    }
    inicioVideoVisor = new Date(toma.start.getTime() + segundo * 1000);
    visorVideo.preload = 'metadata'; // no descargar la toma entera solo por elegirla
    visorVideo.src = urlPlayback(toma.stream, inicioParaUrl(toma, inicioVideoVisor), Math.max(1, disponible));
    if (reproducir) visorVideo.play().catch(() => {});
    pintarBotonesInstante(inicioVideoVisor);
}

/** Instante real que se está viendo (o el inicio del vídeo cargado). */
function instanteVisor() {
    if (!inicioVideoVisor) return tomaElegida ? tomaElegida.start : null;
    return new Date(inicioVideoVisor.getTime() + (visorVideo.currentTime || 0) * 1000);
}

visorVideo.addEventListener('timeupdate', () => {
    if (!tomaElegida || arrastrandoPosicion) return;
    let instante = instanteVisor();
    visorPosicionEl.value = String(Math.round((instante - tomaElegida.start) / 1000));
    pintarBotonesInstante(instante);
});

// Una toma en directo sigue creciendo: al acabar el tramo se pide el siguiente
visorVideo.addEventListener('ended', () => {
    if (!tomaElegida || !idsEnDirecto.has(idToma(tomaElegida)) || !inicioVideoVisor) return;
    let segundo = (inicioVideoVisor.getTime() + visorVideo.duration * 1000 - tomaElegida.start.getTime()) / 1000;
    let seguir = () => {
        if (!tomaElegida) return;
        if (disponibleDesde(tomaElegida, segundo) < 1) { setTimeout(seguir, 1000); return; }
        cargarDesde(segundo);
    };
    seguir();
});

visorVideo.addEventListener('error', () => {
    if (!visorVideo.getAttribute('src')) return;
    mostrarAviso('No se pudo reproducir esta toma. Si se grabó con un códec que el navegador no admite (H265 sin GPU), descárgala en MP4.', 'error');
});

// Deslizador: al moverlo enseña la hora; al soltar, reproduce desde ahí
visorPosicionEl.addEventListener('input', () => {
    if (!tomaElegida) return;
    arrastrandoPosicion = true;
    let instante = new Date(tomaElegida.start.getTime() + Number(visorPosicionEl.value) * 1000);
    visorBurbujaEl.classList.add('visible');
    pintarBurbujaPosicion(instante);
    pintarBotonesInstante(instante);
});
visorPosicionEl.addEventListener('change', () => {
    arrastrandoPosicion = false;
    visorBurbujaEl.classList.remove('visible');
    cargarDesde(Number(visorPosicionEl.value));
});

// ACCIONES
async function enviarTomaAObs() {
    let toma = tomaElegida;
    let instante = instanteVisor();
    if (!toma || !instante) return;
    let segundo = (instante - toma.start) / 1000;
    let disponible = disponibleDesde(toma, segundo);
    if (disponible < 1) {
        mostrarAviso('No queda grabación desde ese punto. Elige un momento anterior.', 'aviso');
        return;
    }
    try {
        // El display encadena tramos: sigue hasta el final (o hasta el directo)
        await enviarRepeticion({ url: urlPlayback(toma.stream, inicioParaUrl(toma, instante), disponible), label: `${toma.stream} a las ${formatTimeOnly(instante)}` });
    } catch (error) {
        mostrarAviso(`No se pudo enviar a OBS: ${error.message}`, 'error');
    }
}

async function quitarTomaDeObs() {
    try {
        await quitarRepeticion();
    } catch (error) {
        mostrarAviso(`No se pudo vaciar la salida de OBS: ${error.message}`, 'error');
    }
}

/**
 * Guarda el instante que se está viendo en los momentos marcados, que se
 * comparten con todos los equipos (aparecen en Repeticiones). Allí se
 * reproduce desde unos segundos antes, como cualquier otra marca.
 */
async function marcarInstanteArchivo() {
    let toma = tomaElegida;
    let instante = instanteVisor();
    if (!toma || !instante) return;
    try {
        await anadirMarcado(toma.stream, instante);
        mostrarAviso(`Marcado ${toma.stream} a las ${formatTimeOnly(instante)}. Está en Momentos marcados de Repeticiones, en todos los equipos.`, 'ok');
    } catch (error) {
        mostrarAviso(`No se pudo guardar la marca: ${error.message}`, 'error');
    }
}

/**
 * Borra del disco los segmentos de 10 min que forman la toma elegida.
 */
async function borrarToma() {
    let toma = tomaElegida;
    if (!toma || idsEnDirecto.has(idToma(toma))) return;
    let fin = finToma(toma);
    let seguro = await confirmar(
        `Se borrará del disco la toma de ${toma.stream} del ${formatDate(toma.start).slice(0, 10)}, de ${formatTimeOnly(toma.start)} a ${formatTimeOnly(fin)} (${formatDuration(toma.duration)}). No se puede deshacer.`,
        { aceptar: 'Borrar toma', peligro: true }
    );
    if (!seguro) return;

    try {
        let respuesta = await fetch(`/api/mediamtx/v3/recordings/get/${encodeURIComponent(toma.stream)}`);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        let datos = await respuesta.json();
        // Segmentos cuyo inicio cae dentro de la toma (con 1 s de margen)
        let segmentos = (datos.segments || []).filter(s => {
            let inicio = new Date(s.start).getTime();
            return inicio >= toma.start.getTime() - 1000 && inicio < fin.getTime() + 1000;
        });
        if (!segmentos.length) throw new Error('no se encontraron sus segmentos');

        let fallidos = 0;
        for (let segmento of segmentos) {
            let url = `/api/mediamtx/v3/recordings/deletesegment?path=${encodeURIComponent(toma.stream)}&start=${encodeURIComponent(segmento.start)}`;
            let r = await fetch(url, { method: 'DELETE' });
            if (!r.ok) fallidos++;
        }
        borrarMiniaturaGuardada(idToma(toma));
        miniaturasEnMemoria.delete(idToma(toma));
        soltarToma();
        await cargarTomas();
        if (fallidos) mostrarAviso(`No se pudieron borrar ${fallidos} de ${segmentos.length} partes de la toma.`, 'error');
        else mostrarAviso('Toma borrada', 'ok');
    } catch (error) {
        mostrarAviso(`No se pudo borrar la toma: ${error.message}`, 'error');
    }
}

// SALIDA DE OBS: tally, "Quitar de OBS" y qué toma está en antena
let estadoSalidaObs = null;

/**
 * Toma a la que pertenece lo que hay en OBS (enviado desde aquí o desde
 * Repeticiones): misma cámara y el instante de inicio cae dentro de la toma.
 * @returns {string|null} id de la toma
 */
function idTomaEnObs() {
    if (!haySalidaObs(estadoSalidaObs)) return null;
    let parametros;
    try {
        parametros = new URL(estadoSalidaObs.url, window.location.origin).searchParams;
    } catch {
        return null;
    }
    let instante = new Date(parametros.get('start')).getTime();
    let toma = todasLasTomas.find(t => t.stream === parametros.get('path')
        && instante >= t.start.getTime() - 1000 && instante <= finToma(t).getTime() + 1000);
    return toma ? idToma(toma) : null;
}

suscribirSalidaObs(estado => {
    estadoSalidaObs = estado;
    quitarObsBtn.disabled = !haySalidaObs(estado);
    pintarTallySalidaObs(estado);
    marcarTomaEnObs(idTomaEnObs());
}, () => {
    quitarObsBtn.disabled = false; // Sin conexión no se sabe qué hay en OBS
});

document.addEventListener('DOMContentLoaded', () => {
    leerFiltrosGuardados();
    pintarVisor(null, false);
    cargarTomas();
    setInterval(() => {
        if (document.hidden || hayDesplegableAbierto() || arrastrandoPosicion) return;
        cargarTomas({ silencioso: true });
    }, REFRESCO_ARCHIVO_MS);
});
