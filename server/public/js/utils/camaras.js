/**
 * IDENTIDAD DE CÁMARA
 * Cada path/cámara tiene un color fijo, el mismo en todas las páginas (chips,
 * selectores, momentos marcados, gráficas). La paleta es categórica y está
 * validada para el fondo oscuro (separación con daltonismo y contraste) en
 * este orden; nunca usa rojo, verde ni ámbar, reservados para el tally.
 * El color nunca va solo: siempre acompaña al nombre de la cámara.
 */

// Orden fijo de la paleta (pares adyacentes validados)
const COLORES_CAMARA_ORDEN = ['--cam-azul', '--cam-naranja', '--cam-cian', '--cam-magenta', '--cam-violeta'];

// Cámaras habituales: color fijo por nombre (el color sigue a la cámara, no a su posición)
const COLORES_CAMARA_FIJOS = {
    cam1: '--cam-azul',
    cam2: '--cam-naranja',
    movil: '--cam-cian',
    extra: '--cam-magenta'
};

// Valores de respaldo si no hay base.css (p. ej. en las salidas OBS)
const COLORES_CAMARA_RESPALDO = {
    '--cam-azul': '#3987e5',
    '--cam-naranja': '#d95926',
    '--cam-cian': '#16a3b8',
    '--cam-magenta': '#d55181',
    '--cam-violeta': '#9085e9',
    '--cam-neutro': '#93a1b0'
};

function variableColorCamara(nombre) {
    const clave = String(nombre || '').toLowerCase();
    if (!clave) return '--cam-neutro';
    if (COLORES_CAMARA_FIJOS[clave]) return COLORES_CAMARA_FIJOS[clave];
    let hash = 0;
    for (const caracter of clave) hash = (hash * 31 + caracter.charCodeAt(0)) >>> 0;
    return COLORES_CAMARA_ORDEN[hash % COLORES_CAMARA_ORDEN.length];
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
    if (elemento) {
        const variable = variableColorCamara(nombre);
        elemento.style.setProperty('--cam', `var(${variable}, ${COLORES_CAMARA_RESPALDO[variable]})`);
    }
    return elemento;
}
