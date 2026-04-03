/**
 * NÚCLEO DE COMUNICACIÓN CON MEDIAMTX API (v3)
 * Proporciona métodos para interactuar con el servidor de streaming de forma robusta.
 */

// Base de la API. Se asume que el frontend y la API comparten el mismo dominio.
let API_BASE = '/api/mediamtx/v3';

/**
 * Une el endpoint con la base evitando errores de barras duplicadas.
 * @example joinApiPath('/paths') => '/api/mediamtx/v3/paths'
 */
function joinApiPath(endpoint) {
    let base = API_BASE.replace(/\/$/, ''); // Quita barra final de la base
    let path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint; // Quita barra inicial del endpoint
    return `${base}/${path}`;
}

/**
 * Construye una URL completa incluyendo parámetros de consulta (Query Params).
 * Limpia automáticamente valores nulos o vacíos.
 */
function buildApiUrl(endpoint, query = {}) {
    let url = new URL(joinApiPath(endpoint), window.location.origin);

    Object.entries(query).forEach(([key, value]) => {
        // Solo añadimos el parámetro si tiene un valor real
        if (value === undefined || value === null || value === '') {
            return;
        }
        url.searchParams.set(key, value);
    });

    return url;
}

/**
 * Analiza la respuesta del servidor según su tipo de contenido.
 */
async function readApiResponse(response) {
    // 204 No Content: No hay nada que leer, devolvemos null.
    if (response.status === 204) {
        return null;
    }

    let contentType = response.headers.get('content-type') || '';
    
    // Si es JSON, lo convertimos en objeto de JS
    if (contentType.includes('application/json')) {
        return await response.json();
    }

    // Si es texto plano o cualquier otra cosa, lo devolvemos tal cual
    const text = await response.text();
    return text || null;
}

/**
 * Función MAESTRA para realizar peticiones HTTP.
 * Centraliza la lógica de headers, serialización y manejo de errores.
 */
async function request(method, endpoint, options = {}) {
    let { body, query, headers = {} } = options;
    
    let init = {
        method,
        headers: { ...headers }
    };

    // Configuración de la URL final
    if (query) {
        endpoint = buildApiUrl(endpoint, query).toString();
    } else {
        endpoint = new URL(joinApiPath(endpoint), window.location.origin).toString();
    }

    // Manejo inteligente del cuerpo de la petición (Body)
    if (body !== undefined) {
        // Si ya es un formato binario o texto plano, se envía directo
        if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
            init.body = body;
        } else {
            // Si es un objeto, lo convertimos a string JSON y avisamos al servidor
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
    }

    // Ejecución de la petición
    let response = await fetch(endpoint, init);

    // Si la respuesta no es 2xx (éxito), lanzamos una excepción con el error del servidor
    if (!response.ok) {
        let errorPayload = await readApiResponse(response).catch(() => null);
        let errorMessage = typeof errorPayload === 'string'
            ? errorPayload
            : errorPayload?.message || errorPayload?.error || null;

        throw new Error(errorMessage || `Error HTTP ${response.status}`);
    }

    return await readApiResponse(response);
}

// Atajos para los métodos HTTP más comunes
async function GET(endpoint, options = {}) {
    return request('GET', endpoint, options);
}

async function POST(endpoint, body, options = {}) {
    return request('POST', endpoint, { ...options, body });
}

async function PATCH(endpoint, body, options = {}) {
    return request('PATCH', endpoint, { ...options, body });
}

/**
 * UTILIDADES DE FORMATEO
 */

/**
 * Escapa caracteres especiales para evitar ataques XSS al insertar texto en el HTML.
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
 * Convierte un número de bytes en una cadena legible (ej: 1048576 -> "1 MB").
 */
function formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';

    let k = 1024;
    let sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    // Calculamos el índice de la unidad usando logaritmos
    let i = Math.floor(Math.log(bytes) / Math.log(k));
    
    // Devolvemos el número redondeado a 2 decimales + la unidad
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}