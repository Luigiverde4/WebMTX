/**
 * MOMENTOS MARCADOS
 * Lista de instantes que el operador marca en directo ("acaba de pasar algo")
 * para pincharlos luego sin tener que buscarlos por la línea temporal.
 *
 * Se guardan en el servidor y se comparten entre todos los equipos
 * (js/utils/marcados.js): la lista llega por SSE y cada acción es una
 * petición a la API; lo que se pinta es siempre lo que manda el servidor.
 * También se marcan desde Archivo. Cada momento es solo stream + instante; la
 * URL de reproducción se reconstruye al pincharlo.
 */

// Al pinchar un momento se reproduce desde unos segundos antes del instante
// marcado para no entrar justo encima.
const MARGEN_PREVIO_S = 5;
const DURACION_MARCADO_S = 30;

let momentosMarcados = [];
// Si llega una lista nueva mientras el operador escribe una nota, se espera
// a que termine para no borrarle el texto.
let repintadoPendiente = false;

/** Ejecuta una acción sobre la API avisando si falla. */
async function accionMarcados(accion, mensajeError) {
    try {
        await accion();
    } catch (error) {
        avisarError(`${mensajeError}: ${error.message}`);
    }
}

/**
 * Instante que se marcaría ahora mismo: hace N segundos, donde N es el valor de
 * "desde hace". Cuando el operador reacciona, la jugada ya ha pasado.
 * @returns {Date}
 */
function instanteAMarcar() {
    return new Date(Date.now() - segundosAtras() * 1000);
}

/**
 * Marca el instante de hace N segundos. Es el botón de pánico: un clic
 * mientras pasa la jugada, sin tocar nada más.
 */
function marcarMomento() {
    let stream = streamSelectEl.value;
    if (!stream) {
        avisarError('No hay ninguna cámara que marcar');
        return;
    }

    let instante = instanteAMarcar();
    accionMarcados(() => anadirMarcado(stream, instante), 'No se pudo guardar la marca');
}

/**
 * Reproduce un momento marcado en la previsualización.
 * @param {number} id - Identificador del momento.
 */
function reproducirMomento(id) {
    let momento = momentosMarcados.find(m => m.id === id);
    if (!momento) return;

    let instante = new Date(momento.iso);
    let inicio = new Date(instante.getTime() - MARGEN_PREVIO_S * 1000);

    let playURL = `/api/playback/get?duration=${encodeURIComponent(DURACION_MARCADO_S)}`
        + `&path=${encodeURIComponent(momento.stream)}`
        + `&start=${encodeURIComponent(inicio.toISOString())}`;

    // Dejar el stream del momento seleccionado, para que el panel sea coherente.
    if (streamSelectEl.value !== momento.stream && [...streamSelectEl.options].some(o => o.value === momento.stream)) {
        streamSelectEl.value = momento.stream;
        poblarGrabaciones();
        pintarColorStream();
    }

    lanzarReproduccion(playURL, 0, momento.stream, inicio);
    renderizarMomentos();
}

/**
 * Envía un momento marcado directamente a OBS.
 * @param {number} id - Identificador del momento.
 */
function enviarMomentoAOBS(id) {
    reproducirMomento(id);   // Deja ultimaSeleccion apuntando a este momento
    enviarAlDisplay();
}

/**
 * Borra un momento de la lista.
 * @param {number} id - Identificador del momento.
 */
function borrarMomento(id) {
    accionMarcados(() => borrarMarcado(id), 'No se pudo borrar la marca');
}

/**
 * Vacía la lista entera (pide confirmación: no se puede deshacer).
 */
async function borrarTodosLosMomentos() {
    if (momentosMarcados.length === 0) return;
    let ok = await confirmar(`¿Borrar los ${momentosMarcados.length} momentos marcados? Se borran para todos los equipos y no se puede deshacer.`, {
        aceptar: 'Borrar todos',
        peligro: true
    });
    if (!ok) return;

    accionMarcados(() => borrarTodosLosMarcados(), 'No se pudieron borrar las marcas');
}

/**
 * Guarda la nota escrita para un momento (para reconocerlo: "gol", "falta"...).
 * @param {number} id - Identificador del momento.
 * @param {string} texto - Nota del usuario.
 */
function anotarMomento(id, texto) {
    accionMarcados(() => anotarMarcado(id, texto.slice(0, 60)), 'No se pudo guardar la nota');
}

function crearBotonIcono(icono, etiqueta, clases = '') {
    let boton = document.createElement('button');
    boton.type = 'button';
    boton.className = `boton boton--peq boton--icono ${clases}`.trim();
    boton.setAttribute('aria-label', etiqueta);
    boton.title = etiqueta;
    boton.innerHTML = `<svg class="icono" aria-hidden="true"><use href="img/iconos.svg#${icono}"/></svg>`;
    return boton;
}

/**
 * Pinta la lista de momentos marcados.
 */
function renderizarMomentos() {
    let lista = document.getElementById('marcadosLista');
    if (!lista) return;

    lista.innerHTML = '';
    document.getElementById('limpiarMarcados').hidden = momentosMarcados.length === 0;

    if (momentosMarcados.length === 0) {
        let vacio = document.createElement('li');
        vacio.className = 'marcados__vacio texto-2 texto-peq';
        vacio.textContent = 'Pulsa Marcar cuando pase algo: se guarda el instante de hace los segundos elegidos en "Desde hace".';
        lista.appendChild(vacio);
        return;
    }

    momentosMarcados.forEach(momento => {
        let instante = new Date(momento.iso);
        let li = document.createElement('li');
        li.className = 'marcado';
        aplicarColorCamara(li, momento.stream);

        let cabecera = document.createElement('div');
        cabecera.className = 'marcado__cabecera';
        cabecera.innerHTML = `<span class="marcado__hora cifra">${escapeHtml(formatTimeOnly(instante))}</span>`
            + `<span class="marcado__stream">${escapeHtml(momento.stream)}</span>`;

        let acciones = document.createElement('div');
        acciones.className = 'marcado__acciones';

        let verBtn = crearBotonIcono('play', `Previsualizar ${momento.stream} a las ${formatTimeOnly(instante)}`);
        verBtn.addEventListener('click', () => reproducirMomento(momento.id));

        let obsBtn = document.createElement('button');
        obsBtn.type = 'button';
        obsBtn.className = 'boton boton--peq boton--directo';
        obsBtn.textContent = 'OBS';
        obsBtn.title = 'Enviar este momento a OBS';
        obsBtn.addEventListener('click', () => enviarMomentoAOBS(momento.id));

        let notaBtn = crearBotonIcono('editar', 'Añadir o editar la nota', 'boton--fantasma');
        let borrarBtn = crearBotonIcono('cerrar', 'Borrar este momento', 'boton--fantasma');
        borrarBtn.addEventListener('click', () => borrarMomento(momento.id));

        acciones.append(verBtn, obsBtn, notaBtn, borrarBtn);
        cabecera.appendChild(acciones);

        // Nota libre para reconocer la jugada; solo ocupa sitio si hay algo escrito.
        let nota = document.createElement('input');
        nota.type = 'text';
        nota.className = 'marcado__nota';
        nota.value = momento.nota || '';
        nota.placeholder = 'Nota (gol, falta…)';
        nota.maxLength = 60;
        nota.hidden = !momento.nota;
        nota.setAttribute('aria-label', `Nota del momento de las ${formatTimeOnly(instante)}`);
        nota.addEventListener('change', () => {
            anotarMomento(momento.id, nota.value);
            if (!nota.value.trim()) nota.hidden = true;
        });

        notaBtn.addEventListener('click', () => {
            nota.hidden = false;
            nota.focus();
        });

        li.append(cabecera, nota);
        lista.appendChild(li);
    });
}

/**
 * Muestra en el botón qué se marcaría ahora mismo: la cámara y el instante.
 * El instante es "ahora menos N", así que avanza solo: se repinta cada segundo.
 */
function actualizarEtiquetaMarcar() {
    let destino = document.getElementById('marcarDestino');
    if (!destino) return;

    let stream = streamSelectEl.value;
    if (!stream) {
        destino.textContent = 'sin cámara';
        return;
    }

    destino.textContent = `${stream}, ${formatTimeOnly(instanteAMarcar())}`;
}

/** ¿El operador está escribiendo una nota de la lista? */
function editandoNota() {
    let activo = document.activeElement;
    return Boolean(activo && activo.classList.contains('marcado__nota'));
}

window.addEventListener('load', () => {
    renderizarMomentos();
    actualizarEtiquetaMarcar();

    // La hora del botón corre con el reloj: refrescarla cada segundo.
    setInterval(actualizarEtiquetaMarcar, 1000);

    // La lista llega del servidor al conectar y tras cada cambio de cualquier equipo
    suscribirMarcados(lista => {
        momentosMarcados = lista;
        if (editandoNota()) {
            repintadoPendiente = true;
            return;
        }
        renderizarMomentos();
    });

    // Al salir de la nota (después de su 'change'), aplicar lo que llegó mientras tanto
    document.getElementById('marcadosLista').addEventListener('focusout', () => {
        setTimeout(() => {
            if (repintadoPendiente && !editandoNota()) {
                repintadoPendiente = false;
                renderizarMomentos();
            }
        }, 0);
    });
});
