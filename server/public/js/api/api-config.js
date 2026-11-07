/**
 * GESTIÓN DE CONFIGURACIÓN GLOBAL - MEDIAMTX
 * Permite leer, visualizar y modificar los parámetros del servidor en tiempo real.
 */

// Referencias al DOM para mostrar datos y capturar entradas del usuario
let configDisplayEl = document.getElementById('configDisplay');
let configKeyEl = document.getElementById('configKey');
let configValueEl = document.getElementById('configValue');

/**
 * Solicita la configuración actual al servidor y activa la renderización.
 */
async function cargarConfig() {
    let display = configDisplayEl;

    try {
        display.innerHTML = '<p class="vacio">Cargando configuración…</p>';

        let config = await GET('/config/global/get');

        display.innerHTML = '';
        mostrarObjetoConfig(config, display);

        marcarAcordeonCargado('configAccordion');
    } catch (error) {
        console.error('Error al cargar config:', error);
        display.innerHTML = `<p class="vacio vacio--error">No se pudo cargar la configuración: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Renderiza un objeto JSON de forma jerárquica (clave / valor). Pulsar una
 * clave la copia al formulario de PATCH.
 * @param {Object} obj - El fragmento de configuración a mostrar.
 * @param {HTMLElement} container - Dónde insertar los elementos.
 */
function mostrarObjetoConfig(obj, container) {
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            let grupo = document.createElement('div');
            grupo.className = 'config__grupo';

            let titulo = document.createElement('div');
            titulo.className = 'config__titulo';
            titulo.textContent = key;

            container.appendChild(titulo);
            container.appendChild(grupo);
            mostrarObjetoConfig(value, grupo);
        } else {
            let item = document.createElement('div');
            item.className = 'config__item';

            let clave = document.createElement('button');
            clave.type = 'button';
            clave.className = 'config__clave';
            clave.textContent = key;
            clave.title = 'Usar esta clave en "Cambiar un valor"';
            clave.addEventListener('click', () => {
                configKeyEl.value = key;
                configValueEl.value = typeof value === 'string' ? value : JSON.stringify(value);
                configValueEl.focus();
            });

            let valor = document.createElement('span');
            valor.className = 'config__valor';
            valor.textContent = JSON.stringify(value);

            item.append(clave, valor);
            container.appendChild(item);
        }
    }
}

/**
 * Envía una actualización de un parámetro específico al servidor.
 */
async function actualizarConfig() {
    let key = configKeyEl.value.trim();
    let value = configValueEl.value.trim();

    if (!key) {
        mostrarAviso('Escribe la clave que quieres cambiar (por ejemplo logLevel).', 'aviso');
        configKeyEl.focus();
        return;
    }

    // Tipado: se intenta como JSON (true, false, números, listas); si no, texto
    let parsedValue;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        parsedValue = value;
    }

    try {
        // PATCH actualiza solo el campo enviado, manteniendo el resto igual
        await PATCH('/config/global/patch', { [key]: parsedValue });

        mostrarAviso(`Guardado: ${key} = ${value}`, 'ok');
        await cargarConfig();

        configKeyEl.value = '';
        configValueEl.value = '';
    } catch (error) {
        console.error('Error al actualizar config:', error);
        mostrarAviso(`No se pudo guardar ${key}: ${error.message}`, 'error');
    }
}

/**
 * Solicita al servidor que recargue su configuración (PATCH vacío).
 */
async function recargarConfig() {
    let ok = await confirmar('¿Recargar la configuración de MediaMTX? Las conexiones activas pueden reiniciarse.', {
        aceptar: 'Recargar'
    });
    if (!ok) return;

    try {
        await PATCH('/config/global/patch', {});

        mostrarAviso('Configuración recargada', 'ok');
        await cargarConfig();
    } catch (error) {
        console.error('Error al recargar:', error);
        mostrarAviso(`No se pudo recargar: ${error.message}`, 'error');
    }
}
