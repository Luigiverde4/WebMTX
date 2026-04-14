/**
 * UTILIDADES COMPARTIDAS DEL FRONTEND
 * Reúne helpers de formato y escape usados por varias pantallas.
 */

/**
 * Escapa caracteres especiales para evitar XSS al insertar texto en HTML.
 * @param {string} value - Texto original.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Convierte bytes a texto legible.
 * @param {number} bytes - Cantidad de bytes.
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0 || !bytes || bytes < 0) return '0 B';

    let k = 1024;
    let sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, index)) * 100) / 100 + ' ' + sizes[index];
}

/**
 * Construye la URL base de WebRTC usando HTTPS por defecto.
 * Si el usuario escribe un protocolo explícito (http:// o https://), se respeta.
 * @param {string} serverHost - Host/IP introducido por el usuario.
 */
function construirBaseUrlWebRTC(serverHost) {
    let rawValue = serverHost.trim().replace(/\/+$/, '');
    let normalized = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
    let parsedUrl = new URL(normalized);

    if (!parsedUrl.port) {
        parsedUrl.port = '8889';
    }

    return `${parsedUrl.protocol}//${parsedUrl.host}`;
}