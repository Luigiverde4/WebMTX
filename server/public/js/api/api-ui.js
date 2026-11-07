/**
 * GESTIÓN DE INTERFAZ DE USUARIO - MEDIAMTX API
 * Maneja la carga bajo demanda de secciones colapsables (acordeones) y el
 * indicador de estado de la API.
 */

// Captura todos los elementos <details> que tienen el atributo 'data-load'
let accordionItems = document.querySelectorAll('details[data-load]');
let estadoApiEl = document.getElementById('estadoApi');
const SONDEO_API_MS = 10000;

/**
 * Abre programáticamente un acordeón por su ID.
 * @param {string} id - El ID del elemento <details>
 */
function abrirAcordeon(id) {
    let details = document.getElementById(id);
    if (details) {
        details.open = true; // Al cambiar a true, se disparará el evento 'toggle'
    }
}

/**
 * Lógica principal de carga diferida.
 * @param {HTMLElement} details - El elemento <details> que se desea cargar.
 */
async function cargarSeccionAcordeon(details) {
    if (details.dataset.loaded === 'true' || details.dataset.loading === 'true') {
        return;
    }

    let loaderName = details.dataset.load;
    let loader = window[loaderName];

    if (typeof loader !== 'function') {
        console.warn(`Cargador no encontrado: ${loaderName}`);
        return;
    }

    details.dataset.loading = 'true';
    try {
        await loader();
        details.dataset.loaded = 'true';
    } catch (error) {
        // Si falla, se permite reintentar al reabrir.
        details.dataset.loaded = '';
        console.error(`Error al cargar la sección ${loaderName}:`, error);
    } finally {
        delete details.dataset.loading;
    }
}

/**
 * Inicializa los eventos de la UI.
 */
function iniciarUiApi() {
    accordionItems.forEach(details => {
        details.addEventListener('toggle', () => {
            if (details.open) {
                cargarSeccionAcordeon(details);
            }
        });

        if (details.open) {
            cargarSeccionAcordeon(details);
        }
    });
}

/**
 * Marca manualmente una sección como cargada (útil para callbacks externos).
 */
function marcarAcordeonCargado(id) {
    let details = document.getElementById(id);
    if (details) {
        details.dataset.loaded = 'true';
    }
}

/**
 * Fuerza la actualización de todas las secciones principales de la API.
 */
async function refrescarTodo() {
    await Promise.all([
        comprobarEstadoApi(),
        cargarPaths(),
        cargarConfig(),
        cargarSesiones(),
        cargarGrabaciones()
    ]);
    mostrarAviso('Todo actualizado', 'ok', 1800);
}

/**
 * Comprueba de verdad que la API responde (antes era un texto fijo).
 */
async function comprobarEstadoApi() {
    let inicio = performance.now();
    try {
        await GET('/paths/list');
        let ms = Math.round(performance.now() - inicio);
        estadoApiEl.className = 'estado estado--ok';
        estadoApiEl.textContent = `API conectada (${ms} ms)`;
    } catch (error) {
        estadoApiEl.className = 'estado estado--error';
        estadoApiEl.textContent = `API sin respuesta: ${error.message}`;
    }
}

window.addEventListener('load', () => {
    iniciarUiApi();
    comprobarEstadoApi();
    setInterval(() => {
        if (!document.hidden) comprobarEstadoApi();
    }, SONDEO_API_MS);
});
