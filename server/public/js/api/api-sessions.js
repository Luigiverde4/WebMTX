/**
 * MONITOR DE SESIONES Y CONEXIONES - MEDIAMTX
 * Gestiona la visualización y desconexión de clientes activos.
 */

// Referencias al DOM para los contenedores de cada protocolo
let rtspSessionsEl = document.getElementById('rtspSessions');
let webrtcSessionsEl = document.getElementById('webrtcSessions');
let hlsMuxersEl = document.getElementById('hlsMuxers');
let sessionsCountEl = document.getElementById('sessionsCount');

/**
 * Carga principal: coordina la carga de todos los protocolos en paralelo.
 */
async function loadSessions() {
    // Lanzamos todas las peticiones simultáneamente para ganar velocidad
    await Promise.all([
        loadRtspSessions(),
        loadWebrtcSessions(),
        loadHlsMuxers()
    ]);

    updateSessionsCount(); // Actualiza el contador global tras cargar todo
    markAccordionLoaded('sessionsAccordion');
}




/**
 * Renderiza las sesiones RTSP (Cámaras IP, VLC, OBS, etc.)
 */
async function loadRtspSessions() {
    let container = rtspSessionsEl;
    try {
        let data = await GET('/rtspsessions/list');

        // No hay sesiones
        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay sesiones RTSP</div>';
            return;
        }

        // Hay sesiones -> Crear cards
        container.innerHTML = '';
        data.items.forEach(session => {
            let card = document.createElement('div');
            card.className = 'session-card';
            card.innerHTML = `
                <div class="session-id">ID: ${escapeHtml(session.id)}</div>
                <div class="session-info"><strong>Estado:</strong> ${escapeHtml(session.state ?? '')}</div>
                ${session.path ? `<div class="session-info"><strong>Path:</strong> ${escapeHtml(session.path)}</div>` : ''}
                <div class="session-info"><strong>↓ Recibido:</strong> ${formatBytes(session.bytesReceived)}</div>
                <div class="session-info"><strong>↑ Enviado:</strong> ${formatBytes(session.bytesSent)}</div>
                <div class="session-actions">
                    <button class="btn-danger btn-small" onclick='kickRtspSessionById(${JSON.stringify(session.id)})'>❌ Cerrar</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error RTSP:', error);
        container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Renderiza sesiones WebRTC (Visualización en navegadores)
 */
async function loadWebrtcSessions() {
    let container = webrtcSessionsEl;
    try {
        let data = await GET('/webrtcsessions/list');

        // No hay sesiones
        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<div class="empty-state">No hay sesiones WebRTC</div>';
            return;
        }

        // Hay sesiones -> Crear cards
        container.innerHTML = '';
        data.items.forEach(session => {
            let card = document.createElement('div');
            card.className = 'session-card';
            card.innerHTML = `
                <div class="session-id">ID: ${escapeHtml(session.id)}</div>
                <div class="session-info"><strong>Conectado:</strong> ${session.peerConnectionEstablished ? '✅ Sí' : '❌ No'}</div>
                <div class="session-info"><strong>Remoto:</strong> ${escapeHtml(session.remoteCandidate || 'N/A')}</div>
                <div class="session-info"><strong>Tráfico:</strong> ↑${formatBytes(session.bytesSent)} / ↓${formatBytes(session.bytesReceived)}</div>
                <div class="session-actions">
                    <button class="btn-danger btn-small" onclick='kickWebrtcSessionById(${JSON.stringify(session.id)})'>❌ Cerrar</button>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error WebRTC:', error);
        container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Calcula el total de conexiones activas detectadas en el DOM.
 */
function updateSessionsCount() {
    let rtsp = rtspSessionsEl.querySelectorAll('.session-card').length;
    let webrtc = webrtcSessionsEl.querySelectorAll('.session-card').length;
    let hls = hlsMuxersEl.querySelectorAll('.session-card').length;
    let total = rtsp + webrtc + hls;

    sessionsCountEl.textContent = `${total} sesión${total !== 1 ? 'es' : ''}`;
}




/**
 * ACCIONES: Expulsar (Kick) usuarios
 */

async function kickRtspSessionById(id) {
    if (!confirm(`¿Cerrar sesión RTSP ${id}?`)) return;

    try {
        // El endpoint /kick/ requiere el ID en la URL. Usamos encodeURIComponent por seguridad.
        await POST(`/rtspsessions/kick/${encodeURIComponent(id)}`);
        alert('Sesión RTSP cerrada');
        await loadRtspSessions(); // Refrescamos solo la lista RTSP
    } catch (error) {
        alert('Error al cerrar sesión: ' + error.message);
    }
}

async function kickWebrtcSessionById(id) {
    if (!confirm(`¿Cerrar sesión WebRTC ${id}?`)) return;

    try {
        await POST(`/webrtcsessions/kick/${encodeURIComponent(id)}`);
        alert('Sesión WebRTC cerrada');
        await loadWebrtcSessions(); // Refrescamos solo la lista WebRTC
    } catch (error) {
        alert('Error al cerrar sesión: ' + error.message);
    }
}