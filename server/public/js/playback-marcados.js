/**
 * MOMENTOS MARCADOS
 * Lista de instantes que el operador marca en directo ("acaba de pasar algo")
 * para pincharlos luego sin tener que buscarlos por la línea temporal.
 *
 * Se guardan en el navegador (localStorage), no en el servidor: son notas de
 * trabajo del operador. Cada momento es solo stream + instante; la URL de
 * reproducción se reconstruye al pincharlo, igual que en el resto del panel.
 */

const CLAVE_MARCADOS = 'poliwood.playback.marcados';

// Cuántos momentos se conservan (los más recientes).
const MAX_MARCADOS = 50;

// Al pinchar un momento se reproduce desde unos segundos antes del instante
// marcado para no entrar justo encima.
const MARGEN_PREVIO_S = 5;
const DURACION_MARCADO_S = 30;

let momentosMarcados = [];

/**
 * Lee los momentos guardados en el navegador.
 * @returns {Array}
 */
function leerMomentos() {
    try {
        let guardado = JSON.parse(localStorage.getItem(CLAVE_MARCADOS));
        return Array.isArray(guardado) ? guardado : [];
    } catch {
        return [];
    }
}

/**
 * Persiste la lista actual.
 */
function guardarMomentos() {
    try {
        localStorage.setItem(CLAVE_MARCADOS, JSON.stringify(momentosMarcados));
    } catch (error) {
        console.warn('No se pudieron guardar los momentos marcados:', error);
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
        setEstado('No hay ninguna cámara que marcar', 'error');
        return;
    }

    let instante = instanteAMarcar();

    momentosMarcados.unshift({
        id: Date.now(),
        stream: stream,
        iso: instante.toISOString(),
        nota: ''
    });

    momentosMarcados = momentosMarcados.slice(0, MAX_MARCADOS);

    guardarMomentos();
    renderizarMomentos();
    setEstado(`Marcado ${stream} a las ${formatTimeOnly(instante)}`, 'ok');
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

    lanzarReproduccion(playURL, 0, momento.stream, inicio, 'un momento marcado');
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
    momentosMarcados = momentosMarcados.filter(m => m.id !== id);
    guardarMomentos();
    renderizarMomentos();
}

/**
 * Vacía la lista entera (pide confirmación: no se puede deshacer).
 */
async function borrarTodosLosMomentos() {
    if (momentosMarcados.length === 0) return;
    let ok = await confirmar(`¿Borrar los ${momentosMarcados.length} momentos marcados? No se puede deshacer.`, {
        aceptar: 'Borrar todos',
        peligro: true
    });
    if (!ok) return;

    momentosMarcados = [];
    guardarMomentos();
    renderizarMomentos();
    setEstado('Momentos marcados borrados', 'info');
}

/**
 * Guarda la nota escrita para un momento (para reconocerlo: "gol", "falta"...).
 * @param {number} id - Identificador del momento.
 * @param {string} texto - Nota del usuario.
 */
function anotarMomento(id, texto) {
    let momento = momentosMarcados.find(m => m.id === id);
    if (!momento) return;

    momento.nota = texto.slice(0, 60);
    guardarMomentos();
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
        obsBtn.className = 'boton boton--peq boton--antena';
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

window.addEventListener('load', () => {
    momentosMarcados = leerMomentos();
    renderizarMomentos();
    actualizarEtiquetaMarcar();

    // La hora del botón corre con el reloj: refrescarla cada segundo.
    setInterval(actualizarEtiquetaMarcar, 1000);
});
