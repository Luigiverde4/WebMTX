/**
 * IDENTIDAD DE CÁMARA
 * Cada path/cámara tiene un color fijo, el mismo en todas las páginas (chips,
 * selectores, momentos marcados, gráficas). Los colores salen de la carta de
 * ajuste y nunca son rojo ni verde: esos están reservados para el tally.
 */

const COLORES_CAMARA_FIJOS = {
    cam1: '--cam-amarillo',
    cam2: '--cam-cian',
    movil: '--cam-magenta',
    extra: '--cam-azul'
};

const COLORES_CAMARA_ROTACION = [
    '--cam-naranja', '--cam-blanco', '--cam-amarillo', '--cam-cian', '--cam-magenta', '--cam-azul'
];

// Valores de respaldo si no hay base.css (p. ej. en tests sin estilos)
const COLORES_CAMARA_RESPALDO = {
    '--cam-amarillo': '#d9c82e',
    '--cam-cian': '#2ec4d9',
    '--cam-magenta': '#c25bd6',
    '--cam-azul': '#4f7be8',
    '--cam-naranja': '#e07b39',
    '--cam-blanco': '#c9d3dc'
};

function variableColorCamara(nombre) {
    const clave = String(nombre || '').toLowerCase();
    if (COLORES_CAMARA_FIJOS[clave]) return COLORES_CAMARA_FIJOS[clave];
    let hash = 0;
    for (const caracter of clave) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
    return COLORES_CAMARA_ROTACION[hash % COLORES_CAMARA_ROTACION.length];
}

/**
 * Color (hex) de una cámara, leído de los tokens de base.css.
 * @param {string} nombre
 * @returns {string}
 */
function colorDeCamara(nombre) {
    const variable = variableColorCamara(nombre);
    const valor = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
    return valor || COLORES_CAMARA_RESPALDO[variable];
}

/**
 * Asigna el color de la cámara a un elemento mediante la custom property --cam.
 * @param {HTMLElement} elemento
 * @param {string} nombre
 */
function aplicarColorCamara(elemento, nombre) {
    if (elemento) elemento.style.setProperty('--cam', `var(${variableColorCamara(nombre)})`);
    return elemento;
}
