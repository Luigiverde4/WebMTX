/**
 * GESTIÓN DE PATHS DE MEDIAMTX
 * Permite listar, crear, actualizar y cerrar los paths activos del servidor.
 */

/**
 * Referencias al DOM para mostrar el listado de paths y capturar entradas del usuario.
 */
let pathsGridEl = document.getElementById('pathsGrid');
let pathsCountEl = document.getElementById('pathsCount');
let pathNameEl = document.getElementById('pathName');
let pathSourceEl = document.getElementById('pathSource');
let pathSourceUrlEl = document.getElementById('pathSourceUrl');
let pathRecordEl = document.getElementById('pathRecord');
let closePathNameEl = document.getElementById('closePathName');
let sourceUrlGroupEl = document.getElementById('sourceUrlGroup');

/**
 * Solicita al servidor el listado de paths activos y actualiza la vista.
 */
async function cargarPaths() {
    let grid = pathsGridEl;
    let count = pathsCountEl;

    try {
        grid.innerHTML = '<p class="vacio">Cargando paths…</p>';

        let data = await GET('/paths/list');

        if (!data.items || data.items.length === 0) {
            grid.innerHTML = '<p class="vacio">No hay ningún path. Aparecen al publicar una cámara o al añadirlos abajo.</p>';
            count.textContent = '0 paths';
            marcarAcordeonCargado('pathsAccordion');
            return;
        }

        let pathCount = data.itemCount ?? data.items.length;
        count.textContent = `${pathCount} path${pathCount !== 1 ? 's' : ''}`;

        grid.innerHTML = '';
        data.items.forEach(path => {
            grid.appendChild(crearTarjetaPath(path));
        });

        marcarAcordeonCargado('pathsAccordion');
    } catch (error) {
        console.error('Error al cargar paths:', error);
        grid.innerHTML = `<p class="vacio error">No se pudieron cargar los paths: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Renderiza una tarjeta para un path concreto con su estado y métricas.
 * @param {Object} path - Path devuelto por la API.
 */
function crearTarjetaPath(path) {
    let card = document.createElement('article');
    card.className = 'tarjeta tarjeta--camara';
    aplicarColorCamara(card, path.name);

    let sourceText = path.source && typeof path.source === 'object' ? path.source.type : (path.source || 'sin origen');
    let pistas = (path.tracks || []).map(track => typeof track === 'string' ? track : track?.codec).filter(Boolean);
    let lectores = Array.isArray(path.readers) ? path.readers.length : 0;
    let nombre = JSON.stringify(path.name);

    card.innerHTML = `
        <header class="tarjeta__cabecera">
            <h3>${escapeHtml(path.name)}</h3>
            <span class="estado ${path.ready ? 'ok' : 'aviso'}">${path.ready ? 'Listo' : 'Sin señal'}</span>
        </header>
        <dl class="datos">
            <dt>Configuración</dt><dd>${escapeHtml(path.confName ?? '—')}</dd>
            <dt>Origen</dt><dd>${escapeHtml(sourceText)}</dd>
            ${path.ready && path.readyTime ? `<dt>Listo desde</dt><dd>${escapeHtml(new Date(path.readyTime).toLocaleString('es-ES'))}</dd>` : ''}
            <dt>Recibido</dt><dd>${escapeHtml(formatBytes(path.bytesReceived || 0))}</dd>
            <dt>Enviado</dt><dd>${escapeHtml(formatBytes(path.bytesSent || 0))}</dd>
            <dt>Espectadores</dt><dd>${lectores}</dd>
        </dl>
        ${pistas.length ? `<div class="pistas">${pistas.map(p => `<span class="pista">${escapeHtml(p)}</span>`).join('')}</div>` : ''}
        <div class="tarjeta__acciones">
            <button type="button" class="boton boton--peq" onclick='editarPath(${escapeHtml(nombre)})'>
                <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#editar"/></svg>Editar
            </button>
            <button type="button" class="boton boton--peq boton--peligro" onclick='confirmarCierrePath(${escapeHtml(nombre)})'>Cerrar</button>
        </div>
    `;

    return card;
}

/**
 * Rellena el formulario con el nombre de un path existente para editarlo.
 * @param {string} pathName - Nombre del path a editar.
 */
function editarPath(pathName) {
    pathNameEl.value = pathName;
    abrirAcordeon('pathsAccordion');
    pathNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pathNameEl.focus({ preventScroll: true });
}

/**
 * Crea o actualiza un path con la fuente y opciones indicadas en el formulario.
 */
async function agregarOActualizarPath() {
    let name = pathNameEl.value.trim();
    let source = pathSourceEl.value;
    let sourceUrl = pathSourceUrlEl.value.trim();
    let record = pathRecordEl.checked;

    if (!name) {
        mostrarAviso('Escribe un nombre para el path.', 'aviso');
        pathNameEl.focus();
        return;
    }
    if (source !== 'publisher' && !sourceUrl) {
        mostrarAviso('Escribe la URL de origen para traer el stream.', 'aviso');
        pathSourceUrlEl.focus();
        return;
    }

    let config = {
        source: source === 'publisher' ? 'publisher' : sourceUrl,
        record: record
    };

    try {
        // add crea; si ya existe, MediaMTX responde "path already exists" y se modifica con patch
        let actualizado = false;
        try {
            await POST(`/config/paths/add/${encodeURIComponent(name)}`, config);
        } catch (error) {
            if (!/already exists/i.test(error.message)) throw error;
            await PATCH(`/config/paths/patch/${encodeURIComponent(name)}`, config);
            actualizado = true;
        }

        mostrarAviso(`Path "${name}" ${actualizado ? 'actualizado' : 'creado'}`, 'ok');
        await cargarPaths();

        pathNameEl.value = '';
        pathSourceEl.value = 'publisher';
        pathSourceUrlEl.value = '';
        pathRecordEl.checked = false;
        sourceUrlGroupEl.hidden = true;
    } catch (error) {
        console.error('Error al configurar path:', error);
        mostrarAviso(`No se pudo guardar el path: ${error.message}`, 'error');
    }
}

/**
 * Cierra un path concreto pidiendo confirmación al usuario.
 * @param {string} pathName - Nombre del path a cerrar.
 */
async function confirmarCierrePath(pathName) {
    let ok = await confirmar(`¿Cerrar el path "${pathName}"? Si alguien está emitiendo en él, se cortará.`, {
        aceptar: 'Cerrar path',
        peligro: true
    });
    if (!ok) return false;

    try {
        // API v3: DELETE /config/paths/delete/{name} (el antiguo POST .../remove daba 404)
        await DELETE(`/config/paths/delete/${encodeURIComponent(pathName)}`);

        mostrarAviso(`Path "${pathName}" cerrado`, 'ok');
        await cargarPaths();
        return true;
    } catch (error) {
        console.error('Error al cerrar path:', error);
        mostrarAviso(`No se pudo cerrar el path: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Lee el nombre de un path desde el formulario rápido y llama al cierre.
 */
async function cerrarPath() {
    let name = closePathNameEl.value.trim();
    if (!name) {
        mostrarAviso('Escribe el nombre del path que quieres cerrar.', 'aviso');
        closePathNameEl.focus();
        return;
    }

    if (await confirmarCierrePath(name)) closePathNameEl.value = '';
}

/**
 * Muestra u oculta el campo de URL según el tipo de fuente seleccionado.
 */
pathSourceEl.addEventListener('change', () => {
    if (pathSourceEl.value === 'publisher') {
        sourceUrlGroupEl.hidden = true;
        return;
    }

    sourceUrlGroupEl.hidden = false;
    pathSourceUrlEl.placeholder = {
        rtsp: 'rtsp://ip-de-la-camara:554/stream',
        rtmp: 'rtmp://servidor/app/stream',
        http: 'https://servidor/stream.m3u8'
    }[pathSourceEl.value] || '';
});
