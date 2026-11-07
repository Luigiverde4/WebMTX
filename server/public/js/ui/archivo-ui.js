/**
 * UI DEL ARCHIVO DE GRABACIONES
 * Referencias al DOM y pintado: filtros, tarjetas de toma con miniatura y el
 * visor. La lógica (datos, filtros, acciones) está en js/archivo.js.
 */

let archivoEl = document.getElementById('archivo');
let tomasEl = document.getElementById('tomas');
let recuentoTomasEl = document.getElementById('recuentoTomas');
let filtroCamarasEl = document.getElementById('filtroCamaras');
let filtroFechaEl = document.getElementById('filtroFecha');
let ordenTomasEl = document.getElementById('ordenTomas');
let filtroCortasEl = document.getElementById('filtroCortas');

let visorEl = document.getElementById('visor');
let visorVideo = document.getElementById('visorVideo');
let visorVacioEl = document.getElementById('visorVacio');
let visorPosicionEl = document.getElementById('visorPosicion');
let visorBurbujaEl = document.getElementById('visorBurbuja');
let enviarObsBtn = document.getElementById('enviarObsBtn');
let quitarObsBtn = document.getElementById('quitarObsBtn');
let descargarBtn = document.getElementById('descargarBtn');
let borrarBtn = document.getElementById('borrarBtn');

// Miniaturas ya resueltas en esta visita (evita volver a IndexedDB al repintar)
const miniaturasEnMemoria = new Map();

/** Identificador estable de una toma. */
function idToma(toma) {
    return `${toma.stream}|${toma.startISO}`;
}

/** Instante en que acaba (o va, si sigue en directo) una toma. */
function finToma(toma) {
    return new Date(toma.start.getTime() + toma.duration * 1000);
}

function inicioDelDia(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

/** "Hoy", "Ayer" o "jueves, 5 de noviembre". */
function etiquetaDia(fecha) {
    let dias = Math.round((inicioDelDia(new Date()) - inicioDelDia(fecha)) / 86400000);
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Ayer';
    let texto = fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** "6 nov" para tarjetas sin cabecera de día. */
function fechaCorta(fecha) {
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Nombre de fichero para descargar: cam1_2026-11-06_21-28.mp4 */
function nombreDescarga(toma) {
    let d = toma.start;
    let dos = n => String(n).padStart(2, '0');
    return `${toma.stream}_${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}_${dos(d.getHours())}-${dos(d.getMinutes())}.mp4`;
}

/** Texto de horas de una toma: "21:28:37 – 22:35:60" o la píldora de directo. */
function horasTomaHtml(toma, enDirecto) {
    return enDirecto
        ? `${escapeHtml(formatTimeOnly(toma.start))} <span class="estado estado--directo">En directo</span>`
        : `${escapeHtml(formatTimeOnly(toma.start))} – ${escapeHtml(formatTimeOnly(finToma(toma)))}`;
}

// FILTROS
/**
 * Chips de cámara: "Todas" más una por cámara grabada, con su color.
 * @param {string[]} camaras - Cámaras con grabaciones.
 * @param {string[]} elegidas - Cámaras marcadas (vacío = todas).
 */
function pintarChipsCamaras(camaras, elegidas) {
    let chips = [`<button type="button" class="chip-camara" aria-pressed="${elegidas.length === 0}" onclick="elegirTodasLasCamaras()">Todas</button>`]
        .concat(camaras.map(nombre =>
            `<button type="button" class="chip-camara" data-camara="${escapeHtml(nombre)}" aria-pressed="${elegidas.includes(nombre)}" onclick="alternarCamara(this.dataset.camara)">${escapeHtml(nombre)}</button>`));
    filtroCamarasEl.innerHTML = chips.join('');
    filtroCamarasEl.querySelectorAll('[data-camara]').forEach(chip => aplicarColorCamara(chip, chip.dataset.camara));
}

// LISTA DE TOMAS
let observadorMiniaturas = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entradas => {
        entradas.filter(e => e.isIntersecting).forEach(e => {
            observadorMiniaturas.unobserve(e.target);
            cargarMiniaturaTarjeta(e.target);
        });
    }, { rootMargin: '300px 0px' })
    : null;

/**
 * Pinta las tomas (agrupadas por día si el orden es por fecha).
 * @param {Array} lista - Tomas ya filtradas y ordenadas.
 * @param {{agrupar: boolean, enDirecto: Set<string>, elegida: string|null, total: number}} opciones
 */
function pintarTomas(lista, { agrupar, enDirecto, elegida, total }) {
    recuentoTomasEl.textContent = lista.length === total
        ? `${total} ${total === 1 ? 'toma' : 'tomas'}`
        : `${lista.length} de ${total} tomas`;

    if (!lista.length) {
        tomasEl.innerHTML = total
            ? '<p class="vacio">Ninguna toma cumple los filtros. Prueba con "Todo" o con todas las cámaras.</p>'
            : '<p class="vacio">Todavía no hay grabaciones. Aparecerán en cuanto una cámara empiece a emitir.</p>';
        return;
    }

    let html = '';
    let diaActual = null;
    lista.forEach(toma => {
        if (agrupar) {
            let dia = etiquetaDia(toma.start);
            if (dia !== diaActual) {
                if (diaActual !== null) html += '</ul>';
                html += `<h3 class="tomas__dia">${escapeHtml(dia)}</h3><ul class="tomas__rejilla">`;
                diaActual = dia;
            }
        } else if (diaActual === null) {
            html += '<ul class="tomas__rejilla">';
            diaActual = '';
        }
        let id = idToma(toma);
        let directo = enDirecto.has(id);
        let miniatura = miniaturasEnMemoria.get(id);
        html += `<li><button type="button" class="toma${directo ? ' toma--directo' : ''}" data-id="${escapeHtml(id)}" data-camara="${escapeHtml(toma.stream)}" aria-pressed="${id === elegida}" onclick="elegirToma(this.dataset.id)">
            <span class="toma__imagen">
                <img alt="" ${miniatura ? `src="${miniatura}"` : 'hidden'}>
                <span class="toma__marcador" aria-hidden="true">${escapeHtml(toma.stream)}</span>
                <span class="toma__obs" hidden>En OBS</span>
                <span class="toma__duracion cifra">${escapeHtml(formatDuration(toma.duration))}</span>
            </span>
            <span class="toma__camara">${escapeHtml(toma.stream)}${agrupar ? '' : ` <span class="texto-2">${escapeHtml(fechaCorta(toma.start))}</span>`}</span>
            <span class="toma__horas cifra">${horasTomaHtml(toma, directo)}</span>
        </button></li>`;
    });
    html += '</ul>';
    tomasEl.innerHTML = html;

    tomasEl.querySelectorAll('.toma').forEach(tarjeta => {
        aplicarColorCamara(tarjeta, tarjeta.dataset.camara);
        if (!miniaturasEnMemoria.has(tarjeta.dataset.id)) {
            if (observadorMiniaturas) observadorMiniaturas.observe(tarjeta);
            else cargarMiniaturaTarjeta(tarjeta);
        }
    });
}

/**
 * Actualiza en sitio duración y horas (las tomas en directo crecen) sin
 * repintar: no se pierde el foco ni el scroll.
 */
function actualizarTomasEnSitio(lista, enDirecto) {
    lista.forEach(toma => {
        let id = idToma(toma);
        let tarjeta = tomasEl.querySelector(`.toma[data-id="${CSS.escape(id)}"]`);
        if (!tarjeta) return;
        let directo = enDirecto.has(id);
        tarjeta.classList.toggle('toma--directo', directo);
        tarjeta.querySelector('.toma__duracion').textContent = formatDuration(toma.duration);
        tarjeta.querySelector('.toma__horas').innerHTML = horasTomaHtml(toma, directo);
    });
}

/** Borde rojo y etiqueta "En OBS" en la toma que está en la salida (o en ninguna). */
function marcarTomaEnObs(id) {
    tomasEl.querySelectorAll('.toma').forEach(t => {
        let enObs = t.dataset.id === id;
        t.classList.toggle('toma--en-obs', enObs);
        t.querySelector('.toma__obs').hidden = !enObs;
    });
}

function marcarTomaElegida(id) {
    tomasEl.querySelectorAll('.toma').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.id === id)));
}

/** Pide la miniatura de una tarjeta: un fotograma a los 5 s (o a mitad si es corta). */
function cargarMiniaturaTarjeta(tarjeta) {
    let toma = buscarToma(tarjeta.dataset.id);
    if (!toma) return;
    let desfase = Math.min(5, toma.duration / 2);
    let url = urlPlayback(toma.stream, new Date(toma.start.getTime() + desfase * 1000), 1);
    pedirMiniatura(tarjeta.dataset.id, url).then(dataUrl => {
        if (!dataUrl) {
            // Queda el recuadro con el nombre de la cámara. Una toma en directo
            // recién empezada aún no tiene nada en disco: se reintenta luego.
            if (idsEnDirecto.has(tarjeta.dataset.id)) {
                setTimeout(() => { if (tarjeta.isConnected) cargarMiniaturaTarjeta(tarjeta); }, 10000);
            }
            return;
        }
        miniaturasEnMemoria.set(tarjeta.dataset.id, dataUrl);
        let img = tarjeta.querySelector('img');
        img.src = dataUrl;
        img.hidden = false;
        if (tomaElegida && idToma(tomaElegida) === tarjeta.dataset.id && !visorVideo.poster) visorVideo.poster = dataUrl;
    });
}

// VISOR
/**
 * Pinta los datos de la toma elegida (o el estado vacío).
 * @param {object|null} toma
 * @param {boolean} enDirecto
 */
function pintarVisor(toma, enDirecto) {
    archivoEl.classList.toggle('sin-seleccion', !toma);
    visorVacioEl.hidden = Boolean(toma);
    visorVideo.controls = Boolean(toma); // sin toma, los controles no llevan a nada
    document.getElementById('visorDirecto').hidden = !enDirecto;
    enviarObsBtn.disabled = !toma;
    document.getElementById('marcarBtn').disabled = !toma;
    descargarBtn.hidden = !toma;
    borrarBtn.disabled = !toma || enDirecto;

    if (!toma) {
        document.getElementById('tituloVisor').textContent = 'Ninguna toma elegida';
        ['visorCamara', 'visorEmpieza', 'visorTermina', 'visorDuracion'].forEach(id => { document.getElementById(id).textContent = '—'; });
        document.getElementById('visorInicio').textContent = '--:--:--';
        document.getElementById('visorFin').textContent = '--:--:--';
        visorPosicionEl.disabled = true;
        document.getElementById('visorNota').textContent = '';
        return;
    }

    let dia = etiquetaDia(toma.start);
    let cuando = dia === 'Hoy' || dia === 'Ayer' ? dia.toLowerCase() : fechaCorta(toma.start);
    document.getElementById('tituloVisor').textContent = `${toma.stream}, ${cuando} a las ${formatTimeOnly(toma.start)}`;
    document.getElementById('visorCamara').textContent = toma.stream;
    document.getElementById('visorEmpieza').textContent = formatDate(toma.start);
    document.getElementById('visorTermina').textContent = enDirecto ? 'Sigue grabando' : formatDate(finToma(toma));
    document.getElementById('visorDuracion').textContent = formatDuration(toma.duration);
    document.getElementById('visorInicio').textContent = formatTimeOnly(toma.start);
    document.getElementById('visorFin').textContent = enDirecto ? 'ahora' : formatTimeOnly(finToma(toma));
    visorPosicionEl.disabled = false;
    visorPosicionEl.max = String(Math.max(1, Math.floor(toma.duration)));

    descargarBtn.href = urlPlayback(toma.stream, toma.startISO, toma.duration, 'mp4');
    descargarBtn.download = nombreDescarga(toma);
    document.getElementById('descargarTexto').textContent = `Descargar MP4 (${formatDuration(toma.duration)})`;
    document.getElementById('visorNota').textContent = enDirecto
        ? 'Sigue grabando: no se puede borrar hasta que la cámara deje de emitir. La descarga llega hasta ahora.'
        : 'La descarga es de la toma entera; una toma larga puede ocupar varios GB.';
    borrarBtn.title = enDirecto ? 'No se puede borrar mientras sigue grabando' : '';
}

/** Coloca la burbuja de hora sobre el punto del deslizador. */
function pintarBurbujaPosicion(instante) {
    let max = Number(visorPosicionEl.max) || 1;
    let fraccion = Number(visorPosicionEl.value) / max;
    let ancho = visorPosicionEl.getBoundingClientRect().width;
    let pulgar = 16; // ancho aproximado del pulgar del range
    visorBurbujaEl.style.setProperty('--posicion', `${pulgar / 2 + fraccion * (ancho - pulgar)}px`);
    visorBurbujaEl.textContent = formatTimeOnly(instante);
}

/** Los botones que actúan sobre el instante visto dicen qué hora usarán. */
function pintarBotonesInstante(instante) {
    document.getElementById('enviarObsTexto').textContent = instante
        ? `Enviar a OBS desde las ${formatTimeOnly(instante)}`
        : 'Enviar a OBS';
    document.getElementById('marcarTexto').textContent = instante
        ? `Marcar las ${formatTimeOnly(instante)}`
        : 'Marcar';
}
