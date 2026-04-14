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
        grid.innerHTML = '<div class="empty-state">Cargando paths...</div>';

        let data = await GET('/paths/list');

        // No hay paths activos
        if (!data.items || data.items.length === 0) {
            grid.innerHTML = '<div class="empty-state">No hay paths activos</div>';
            count.textContent = '0 paths';
            marcarAcordeonCargado('pathsAccordion');
            return;
        }

        // Hay paths -> Crear cards
        let pathCount = data.itemCount ?? data.items.length;
        count.textContent = `${pathCount} path${pathCount !== 1 ? 's' : ''}`;

        grid.innerHTML = '';
        data.items.forEach(path => {
            grid.appendChild(crearTarjetaPath(path));
        });

        marcarAcordeonCargado('pathsAccordion');
    } catch (error) {
        console.error('Error al cargar paths:', error);
        grid.innerHTML = `<div class="empty-state">❌ Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Renderiza un card HTML para un path concreto con su estado y métricas.
 * @param {Object} path - Path devuelto por la API.
 */
function crearTarjetaPath(path) {
    // Crear el elemento de la card
    let card = document.createElement('div');
    card.className = 'path-card';

    // Preparar los datos
    let sourceText = typeof path.source === 'object' ? path.source.type : path.source;
    let bytesReceived = formatBytes(path.bytesReceived || 0);
    let bytesSent = formatBytes(path.bytesSent || 0);

    // Crear el HTML de la card
    card.innerHTML = `
        <div class="path-card-header">
            <div class="path-name">${escapeHtml(path.name)}</div>
            <div class="path-status ${path.ready ? 'ready' : 'not-ready'}">
                ${path.ready ? '🟢 Ready' : '🔴 Not Ready'}
            </div>
        </div>
        <div class="path-info"><strong>Config:</strong> ${escapeHtml(path.confName ?? '')}</div>
        <div class="path-info"><strong>Source:</strong> ${escapeHtml(sourceText ?? '')}</div>
        ${path.ready && path.readyTime ? `<div class="path-info"><strong>Ready since:</strong> ${escapeHtml(new Date(path.readyTime).toLocaleString())}</div>` : ''}
        ${path.tracks && path.tracks.length > 0 ? `
            <div class="path-tracks">
                ${path.tracks.map(track => `<span class="track-badge">${escapeHtml(track)}</span>`).join('')}
            </div>
        ` : ''}
        <div class="path-info"><strong>↓ Received:</strong> ${escapeHtml(bytesReceived)}</div>
        <div class="path-info"><strong>↑ Sent:</strong> ${escapeHtml(bytesSent)}</div>
        ${path.readers && path.readers.length > 0 ? `<div class="path-info"><strong>👁️ Readers:</strong> ${path.readers.length}</div>` : ''}
        <div class="path-actions">
            <button class="btn-secondary btn-small" onclick='editarPath(${JSON.stringify(path.name)})'>✏️ Edit</button>
            <button class="btn-danger btn-small" onclick='confirmarCierrePath(${JSON.stringify(path.name)})'>🗑️ Close</button>
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
        alert('Please enter a path name');
        return;
    }

    let config = {
        source: source === 'publisher' ? 'publisher' : sourceUrl || source,
        record: record
    };

    try {
        await POST(`/config/paths/add/${encodeURIComponent(name)}`, config);

        alert(`Path "${name}" configurado con éxito`);
        await cargarPaths();

        pathNameEl.value = '';
        pathSourceEl.value = 'publisher';
        pathSourceUrlEl.value = '';
        pathRecordEl.checked = false;
    } catch (error) {
        console.error('Error al configurar path:', error);
        alert('Error al configurar path: ' + error.message);
    }
}

/**
 * Cierra un path concreto pidiendo confirmación al usuario.
 * @param {string} pathName - Nombre del path a cerrar.
 */
async function confirmarCierrePath(pathName) {
    if (!confirm(`¿Cerrar el path "${pathName}"?`)) return;

    try {
        await POST(`/config/paths/remove/${encodeURIComponent(pathName)}`);

        alert(`Path "${pathName}" cerrado`);
        await cargarPaths();
    } catch (error) {
        console.error('Error al cerrar path:', error);
        alert('Error al cerrar path: ' + error.message);
    }
}

/**
 * Lee el nombre de un path desde el formulario rápido y llama al cierre.
 */
async function cerrarPath() {
    let name = closePathNameEl.value.trim();
    if (!name) {
        alert('Por favor, introduce un nombre para el path');
        return;
    }

    await confirmarCierrePath(name);
    closePathNameEl.value = '';
}

/**
 * Muestra u oculta el campo de URL según el tipo de fuente seleccionado.
 */
pathSourceEl.addEventListener('change', () => {
    if (pathSourceEl.value === 'publisher') {
        sourceUrlGroupEl.style.display = 'none';
        return;
    }

    sourceUrlGroupEl.style.display = 'block';
    let placeholder = {
        rtsp: 'rtsp://camera-ip:554/stream',
        rtmp: 'rtmp://server/app/stream',
        http: 'https://server/stream.m3u8'
    }[pathSourceEl.value] || '';
    pathSourceUrlEl.placeholder = placeholder;
});
