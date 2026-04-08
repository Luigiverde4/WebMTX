/**
 * GESTIÓN DE INTERFAZ DE USUARIO - MEDIAMTX API
 * Maneja la carga bajo demanda de secciones colapsables (acordeones).
 */

// Captura todos los elementos <details> que tienen el atributo 'data-load'
let accordionItems = document.querySelectorAll('details[data-load]');

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
    // 1. Verificación de estado: Si ya se cargó o está cargando, abortamos para ahorrar recursos.
    if (details.dataset.loaded === 'true' || details.dataset.loading === 'true') {
        return;
    }

    // 2. Obtención del cargador: Extraemos el nombre de la función del atributo data-load.
    let loaderName = details.dataset.load;
    let loader = window[loaderName]; // Buscamos la función en el objeto global 'window'

    // Si la función no existe, salimos discretamente.
    if (typeof loader !== 'function') {
        console.warn(`Cargador no encontrado: ${loaderName}`);
        return;
    }

    // 3. Proceso de carga: Marcamos como 'loading' para evitar clics dobles.
    details.dataset.loading = 'true';
    try {
        await loader(); // Ejecutamos la función de carga (ej: loadPaths())
        details.dataset.loaded = 'true'; // Marcamos éxito
    } catch (error) {
        // Si falla, reseteamos 'loaded' para permitir que el usuario reintente al reabrir.
        details.dataset.loaded = '';
        console.error(`Error al cargar la sección ${loaderName}:`, error);
    } finally {
        // Quitamos el flag de 'loading' siempre (haya error o éxito).
        delete details.dataset.loading;
    }
}

/**
 * Inicializa los eventos de la UI.
 * Configura los escuchadores para cada acordeón detectado.
 */
function iniciarUiApi() {
    accordionItems.forEach(details => {
        // Escuchamos el evento 'toggle' (se dispara al abrir o cerrar)
        details.addEventListener('toggle', () => {
            if (details.open) {
                cargarSeccionAcordeon(details);
            }
        });

        // Si el acordeón ya viene abierto por defecto en el HTML, cargamos sus datos de inmediato.
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
 * Útil para un botón de "Refrescar" global.
 */
function refrescarTodo() {
    return Promise.all([
        cargarPaths(),
        cargarConfig(),
        cargarSesiones(),
        cargarGrabaciones()
    ]);
}

/**
 * Punto de entrada: Arranca la lógica cuando el DOM está completamente listo.
 */
window.addEventListener('load', () => {
    console.log('MediaMTX API UI inicializada');
    iniciarUiApi();
});