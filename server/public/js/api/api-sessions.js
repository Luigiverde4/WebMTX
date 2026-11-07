/**
 * MONITOR DE SESIONES Y CONEXIONES - MEDIAMTX
 * Gestiona la visualización y desconexión de clientes activos.
 */

// Referencias al DOM para los contenedores de cada protocolo
let rtspSessionsEl = document.getElementById('rtspSessions');
let webrtcSessionsEl = document.getElementById('webrtcSessions');
let hlsMuxersEl = document.getElementById('hlsMuxers');
let sessionsCountEl = document.getElementById('sessionsCount');
let closeRtspIdEl = document.getElementById('closeRtspId');
let closeWebrtcIdEl = document.getElementById('closeWebrtcId');

/**
 * Carga principal: coordina la carga de todos los protocolos en paralelo.
 */
async function cargarSesiones() {
    await Promise.all([
        cargarSesionesRtsp(),
        cargarSesionesWebrtc(),
        cargarMuxersHls()
    ]);

    actualizarConteoSesiones();
    marcarAcordeonCargado('sessionsAccordion');
}

/**
 * Tarjeta de sesión (la clase tarjeta-sesion la usa el contador).
 */
function crearTarjetaSesion({ titulo, path, filas, accion }) {
    let card = document.createElement('article');
    card.className = 'tarjeta tarjeta-sesion';
    if (path) aplicarColorCamara(card, path);
    card.innerHTML = `
        <header class="tarjeta__cabecera">
            <h3 class="tarjeta__id">${escapeHtml(titulo)}</h3>
        </header>
        <dl class="datos">
            ${filas.map(([dt, dd]) => `<dt>${escapeHtml(dt)}</dt><dd>${escapeHtml(dd)}</dd>`).join('')}
        </dl>
        ${accion ? `<div class="tarjeta__acciones">${accion}</div>` : ''}
    `;
    return card;
}

/**
 * Renderiza las sesiones RTSP (cámaras IP, VLC, OBS, ffmpeg…)
 */
async function cargarSesionesRtsp() {
    let container = rtspSessionsEl;
    try {
        let data = await GET('/rtspsessions/list');

        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<p class="vacio">Sin sesiones RTSP</p>';
            return;
        }

        container.innerHTML = '';
        data.items.forEach(session => {
            container.appendChild(crearTarjetaSesion({
                titulo: session.id,
                path: session.path,
                filas: [
                    ['Estado', session.state ?? '—'],
                    ['Path', session.path || '—'],
                    ['Recibido', formatBytes(session.bytesReceived)],
                    ['Enviado', formatBytes(session.bytesSent)]
                ],
                accion: `<button type="button" class="boton boton--peq boton--peligro" onclick='expulsarSesionRtspPorId(${escapeHtml(JSON.stringify(session.id))})'>Expulsar</button>`
            }));
        });
    } catch (error) {
        console.error('Error RTSP:', error);
        container.innerHTML = `<p class="vacio vacio--error">No se pudieron cargar las sesiones RTSP: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Renderiza sesiones WebRTC (emisores WHIP y espectadores WHEP)
 */
async function cargarSesionesWebrtc() {
    let container = webrtcSessionsEl;
    try {
        let data = await GET('/webrtcsessions/list');

        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<p class="vacio">Sin sesiones WebRTC</p>';
            return;
        }

        container.innerHTML = '';
        data.items.forEach(session => {
            container.appendChild(crearTarjetaSesion({
                titulo: session.id,
                path: session.path,
                filas: [
                    ['Path', session.path ? `${session.path} (${session.state || ''})`.trim() : '—'],
                    ['Conectada', session.peerConnectionEstablished ? 'Sí' : 'No'],
                    ['Remoto', session.remoteCandidate || '—'],
                    ['Recibido', formatBytes(session.bytesReceived)],
                    ['Enviado', formatBytes(session.bytesSent)]
                ],
                accion: `<button type="button" class="boton boton--peq boton--peligro" onclick='expulsarSesionWebrtcPorId(${escapeHtml(JSON.stringify(session.id))})'>Expulsar</button>`
            }));
        });
    } catch (error) {
        console.error('Error WebRTC:', error);
        container.innerHTML = `<p class="vacio vacio--error">No se pudieron cargar las sesiones WebRTC: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Calcula el total de conexiones activas detectadas en el DOM.
 */
function actualizarConteoSesiones() {
    let rtsp = rtspSessionsEl.querySelectorAll('.tarjeta-sesion').length;
    let webrtc = webrtcSessionsEl.querySelectorAll('.tarjeta-sesion').length;
    let hls = hlsMuxersEl.querySelectorAll('.tarjeta-sesion').length;
    let total = rtsp + webrtc + hls;

    sessionsCountEl.textContent = `${total} ${total === 1 ? 'sesión' : 'sesiones'}`;
}


/**
 * ACCIONES: expulsar clientes
 */
async function expulsarSesionRtspPorId(id) {
    let ok = await confirmar(`¿Expulsar la sesión RTSP ${id}? Si es una cámara, dejará de emitir.`, { aceptar: 'Expulsar', peligro: true });
    if (!ok) return false;

    try {
        await POST(`/rtspsessions/kick/${encodeURIComponent(id)}`);
        mostrarAviso('Sesión RTSP expulsada', 'ok');
        await cargarSesionesRtsp();
        actualizarConteoSesiones();
        return true;
    } catch (error) {
        mostrarAviso(`No se pudo expulsar la sesión: ${error.message}`, 'error');
        return false;
    }
}

async function expulsarSesionWebrtcPorId(id) {
    let ok = await confirmar(`¿Expulsar la sesión WebRTC ${id}?`, { aceptar: 'Expulsar', peligro: true });
    if (!ok) return false;

    try {
        await POST(`/webrtcsessions/kick/${encodeURIComponent(id)}`);
        mostrarAviso('Sesión WebRTC expulsada', 'ok');
        await cargarSesionesWebrtc();
        actualizarConteoSesiones();
        return true;
    } catch (error) {
        mostrarAviso(`No se pudo expulsar la sesión: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Renderiza muxers HLS activos.
 */
async function cargarMuxersHls() {
    let container = hlsMuxersEl;
    try {
        let data = await GET('/hlsmuxers/list');

        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<p class="vacio">Sin muxers HLS</p>';
            return;
        }

        container.innerHTML = '';
        data.items.forEach(muxer => {
            container.appendChild(crearTarjetaSesion({
                titulo: muxer.path || muxer.id || 'Muxer',
                path: muxer.path,
                filas: [
                    ['Recibido', formatBytes(muxer.bytesReceived || 0)],
                    ['Enviado', formatBytes(muxer.bytesSent || 0)]
                ]
            }));
        });
    } catch (error) {
        console.error('Error HLS:', error);
        container.innerHTML = `<p class="vacio vacio--error">No se pudieron cargar los muxers HLS: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Acción rápida: cierra una sesión RTSP desde el campo de acciones rápidas.
 */
async function expulsarSesionRtsp() {
    let id = closeRtspIdEl ? closeRtspIdEl.value.trim() : '';
    if (!id) {
        mostrarAviso('Escribe el ID de la sesión RTSP (está en Sesiones).', 'aviso');
        return;
    }

    if (await expulsarSesionRtspPorId(id) && closeRtspIdEl) closeRtspIdEl.value = '';
}

/**
 * Acción rápida: cierra una sesión WebRTC desde el campo de acciones rápidas.
 */
async function expulsarSesionWebrtc() {
    let id = closeWebrtcIdEl ? closeWebrtcIdEl.value.trim() : '';
    if (!id) {
        mostrarAviso('Escribe el ID de la sesión WebRTC (está en Sesiones).', 'aviso');
        return;
    }

    if (await expulsarSesionWebrtcPorId(id) && closeWebrtcIdEl) closeWebrtcIdEl.value = '';
}
