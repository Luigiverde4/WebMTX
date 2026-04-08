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
        display.innerHTML = '<div class="empty-state">Cargando configuración...</div>';

        // Petición GET al endpoint global
        let config = await GET('/config/global/get');

        display.innerHTML = '';
        // Llamada a la función recursiva para dibujar el objeto JSON
        mostrarObjetoConfig(config, display);
        
        // Marcamos el acordeón como cargado (función definida en el primer script)
        marcarAcordeonCargado('configAccordion');
    } catch (error) {
        console.error('Error al cargar config:', error);
        display.innerHTML = `<div class="empty-state">❌ Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Renderiza un objeto JSON de forma jerárquica en el HTML.
 * @param {Object} obj - El fragmento de configuración a mostrar.
 * @param {HTMLElement} container - Dónde insertar los elementos.
 */
function mostrarObjetoConfig(obj, container) {
    for (const [key, value] of Object.entries(obj)) {
        // Si el valor es un objeto (y no un array o nulo), creamos una subsección
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            let section = document.createElement('div');
            section.style.marginLeft = '20px'; // Sangría para visualización jerárquica
            section.style.marginTop = '10px';
            
            let header = document.createElement('div');
            header.style.fontWeight = 'bold';
            header.style.color = '#2563eb';
            header.textContent = key;
            
            container.appendChild(header);
            container.appendChild(section);
            
            // RECURSIÓN: La función se llama a sí misma para procesar el sub-objeto
            mostrarObjetoConfig(value, section);
        } else {
            // Si es un valor simple (string, number, boolean), lo dibujamos directamente
            let item = document.createElement('div');
            item.className = 'config-item';
            item.innerHTML = `
                <span class="config-key">${escapeHtml(key)}</span>
                <span class="config-value">${escapeHtml(JSON.stringify(value))}</span>
            `;
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
        alert('Por favor, introduce una clave de configuración');
        return;
    }

    // Lógica de tipado dinámico: intentamos parsear como JSON (para captar true, false, números u objetos)
    let parsedValue;
    try {
        parsedValue = JSON.parse(value);
    } catch {
        // Si falla el parseo (ej: es un string simple), lo usamos tal cual
        parsedValue = value;
    }

    // Preparamos el objeto con la clave dinámica, ej: { [rtmp]: false }
    let config = { [key]: parsedValue };

    try {
        // PATCH actualiza solo el campo enviado, manteniendo el resto igual
        await PATCH('/config/global/patch', config);

        alert(`Configuración actualizada: ${key} = ${value}`);
        await cargarConfig(); // Refrescamos la vista para confirmar el cambio

        // Limpiamos los campos de entrada
        configKeyEl.value = '';
        configValueEl.value = '';
    } catch (error) {
        console.error('Error al actualizar config:', error);
        alert('Error al actualizar: ' + error.message);
    }
}

/**
 * Solicita al servidor que recargue su configuración desde el archivo físico (mediamtx.yml).
 */
async function recargarConfig() {
    if (!confirm('¿Recargar configuración desde el archivo?')) return;

    try {
        // Enviar un objeto vacío al patch suele forzar el reload en esta API
        await PATCH('/config/global/patch', {});

        alert('Configuración recargada con éxito');
        await cargarConfig();
    } catch (error) {
        console.error('Error al recargar:', error);
        alert('Error al recargar: ' + error.message);
    }
}