/**
 * MOMENTOS MARCADOS (cliente de /api/marcados, sin DOM)
 * Instantes que los operadores guardan para lanzarlos luego como repetición.
 * Se guardan en el servidor y se comparten entre todos los equipos: cada
 * cambio llega por SSE a todas las pantallas abiertas. Los marca Repeticiones
 * (botón Marcar) y Archivo (visor), y los lista Repeticiones.
 *   { id: número, stream: 'cam1', iso: '2026-11-07T10:31:30.000Z', nota: '' }
 */

/** Petición a la API de marcas; lanza un Error con el mensaje del servidor. */
async function peticionMarcados(metodo, ruta = '', cuerpo) {
    let respuesta = await fetch(`/api/marcados${ruta}`, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    if (!respuesta.ok) {
        let detalle = await respuesta.json().catch(() => ({}));
        throw new Error(detalle.error || `HTTP ${respuesta.status}`);
    }
    return respuesta.status === 204 ? null : respuesta.json();
}

/**
 * Guarda un momento para todos los equipos.
 * @param {string} stream
 * @param {Date} instante
 * @returns {Promise<object>} La marca creada.
 */
function anadirMarcado(stream, instante) {
    return peticionMarcados('POST', '', { stream, iso: instante.toISOString() });
}

function anotarMarcado(id, nota) {
    return peticionMarcados('PATCH', `/${encodeURIComponent(id)}`, { nota });
}

function borrarMarcado(id) {
    return peticionMarcados('DELETE', `/${encodeURIComponent(id)}`);
}

function borrarTodosLosMarcados() {
    return peticionMarcados('DELETE');
}

/**
 * Recibe la lista completa al conectar y tras cada cambio (de cualquier equipo).
 * @param {(lista: Array) => void} alCambiar
 * @param {() => void} [alPerderConexion]
 */
function suscribirMarcados(alCambiar, alPerderConexion) {
    if (typeof EventSource === 'undefined') return;
    let source = new EventSource('/api/marcados/events');
    source.onmessage = (event) => {
        try {
            alCambiar(JSON.parse(event.data));
        } catch (error) {
            console.warn('Mensaje SSE de marcas no válido:', error);
        }
    };
    source.onerror = () => { if (alPerderConexion) alPerderConexion(); };
}
