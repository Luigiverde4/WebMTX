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

/**
 * Añade a la respuesta de MediaMTX (WHIP/WHEP) un candidato ICE con la IP por
 * la que esta página llega al servidor.
 *
 * MediaMTX corre en Docker y no ve las IPs del equipo, solo las del
 * contenedor; por eso había que anunciarlas a mano (WEBRTC_HOSTS). Pero el
 * navegador ya sabe una que funciona seguro: la de la barra de direcciones.
 * El vídeo entra por el mismo equipo (puerto UDP publicado por Docker), así
 * que esa IP vale también para WebRTC, en cualquier red y sin configurar nada.
 *
 * Solo con IPs (y localhost): si la página se abrió por un nombre, se usan
 * los candidatos que anuncie MediaMTX.
 * @param {string} sdp - Respuesta SDP de MediaMTX.
 * @param {string} urlWebrtc - URL del WHIP/WHEP a la que se mandó la oferta.
 * @returns {string} La respuesta con el candidato añadido a cada sección.
 */
function anadirCandidatoDelServidor(sdp, urlWebrtc) {
    let host;
    try {
        host = new URL(urlWebrtc).hostname.replace(/^\[|\]$/g, '');
    } catch {
        return sdp;
    }
    if (host === 'localhost') host = '127.0.0.1';
    let esIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
    if (!esIp) return sdp;

    let fin = sdp.includes('\r\n') ? '\r\n' : '\n';
    let lineas = sdp.split(/\r?\n/);
    if (lineas.at(-1) === '') lineas.pop();
    // Ya anunciada por MediaMTX (WEBRTC_HOSTS): nada que añadir
    if (lineas.some(l => l.startsWith('a=candidate:') && l.split(' ')[4] === host)) return sdp;

    // Puerto UDP de MediaMTX: el de sus propios candidatos (webrtcLocalUDPAddress)
    let puerto = 8189;
    let conPuerto = lineas.find(l => /^a=candidate:\S+ \d+ udp /i.test(l));
    if (conPuerto) puerto = conPuerto.split(' ')[5];
    let candidato = `a=candidate:webmtxpagina 1 udp 2130706431 ${host} ${puerto} typ host`;

    // Al final de cada sección m= (antes de a=end-of-candidates si lo hay)
    let salida = [];
    let enMedia = false;
    let puesto = false;
    let cerrarSeccion = () => { if (enMedia && !puesto) salida.push(candidato); };
    lineas.forEach(linea => {
        if (linea.startsWith('m=')) {
            cerrarSeccion();
            enMedia = true;
            puesto = false;
        } else if (enMedia && linea === 'a=end-of-candidates' && !puesto) {
            salida.push(candidato);
            puesto = true;
        }
        salida.push(linea);
    });
    cerrarSeccion();
    return salida.join(fin) + fin;
}