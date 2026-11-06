/**
 * GESTIÓN DE GRABACIONES - MEDIAMTX
 * Permite listar grabaciones y borrar segmentos concretos desde la interfaz.
 */

// Referencias al DOM para el listado de grabaciones y el formulario de borrado.
let recordingsManagementEl = document.getElementById('recordingsManagement');
let deleteRecPathEl = document.getElementById('deleteRecPath');
let deleteRecStartEl = document.getElementById('deleteRecStart');

/**
 * Carga el listado de grabaciones y pinta sus segmentos en pantalla.
 */
async function cargarGrabaciones() {
    let container = recordingsManagementEl;

    try {
        container.innerHTML = '<p class="vacio">Cargando grabaciones…</p>';

        let data = await GET('/recordings/list');

        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<p class="vacio">No hay grabaciones.</p>';
            marcarAcordeonCargado('recordingsAccordion');
            return;
        }

        container.innerHTML = '';
        data.items.forEach(recording => {
            let grupo = document.createElement('section');
            grupo.className = 'grabacion';
            aplicarColorCamara(grupo, recording.name);

            let segmentos = recording.segments || [];
            let filas = segmentos.map(segment => {
                let inicio = new Date(segment.start);
                return `<li class="grabacion__segmento">
                    <span class="cifra">${escapeHtml(inicio.toLocaleDateString('es-ES'))} ${escapeHtml(inicio.toLocaleTimeString('es-ES'))}</span>
                    <button type="button" class="boton boton--peq boton--icono boton--fantasma" aria-label="Borrar el segmento de las ${escapeHtml(inicio.toLocaleTimeString('es-ES'))}"
                        onclick='confirmarBorradoSegmentoGrabacion(${escapeHtml(JSON.stringify(recording.name))}, ${escapeHtml(JSON.stringify(segment.start))})'>
                        <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#borrar"/></svg>
                    </button>
                </li>`;
            }).join('');

            grupo.innerHTML = `
                <h3 class="grabacion__nombre"><span class="punto-camara" aria-hidden="true"></span>${escapeHtml(recording.name)}
                    <span class="texto-2 texto-peq cifra">${segmentos.length} ${segmentos.length === 1 ? 'segmento' : 'segmentos'}</span></h3>
                ${filas ? `<ul class="grabacion__segmentos">${filas}</ul>` : '<p class="vacio">Sin segmentos</p>'}
            `;

            container.appendChild(grupo);
        });

        marcarAcordeonCargado('recordingsAccordion');
    } catch (error) {
        console.error('Error loading recordings:', error);
        container.innerHTML = `<p class="vacio error">No se pudieron cargar las grabaciones: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Lee el formulario rápido y delega en la función de borrado confirmada.
 */
async function borrarSegmentoGrabacion() {
    let path = deleteRecPathEl.value.trim();
    let start = deleteRecStartEl.value.trim();

    if (!path || !start) {
        mostrarAviso('Rellena el path y el inicio del segmento (formato ISO).', 'aviso');
        return;
    }

    await confirmarBorradoSegmentoGrabacion(path, start);
}

/**
 * Borra un segmento concreto de grabación pidiendo confirmación previa.
 * @param {string} path - Ruta de la grabación.
 * @param {string} start - Marca de inicio del segmento.
 */
async function confirmarBorradoSegmentoGrabacion(path, start) {
    let ok = await confirmar(`¿Borrar el segmento de ${path} que empieza en ${start}? No se puede deshacer.`, {
        aceptar: 'Borrar segmento',
        peligro: true
    });
    if (!ok) return;

    try {
        await DELETE('/recordings/deletesegment', {
            query: { path, start }
        });

        mostrarAviso('Segmento borrado', 'ok');
        await cargarGrabaciones();

        deleteRecPathEl.value = '';
        deleteRecStartEl.value = '';
    } catch (error) {
        console.error('Error deleting recording segment:', error);
        mostrarAviso(`No se pudo borrar el segmento: ${error.message}`, 'error');
    }
}
