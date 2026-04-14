/**
 * NÚCLEO DE COMUNICACIÓN CON MEDIAMTX API (v3)
 * Proporciona métodos para interactuar con el servidor de streaming de forma robusta.
 */

// Base de la API. Se asume que el frontend y la API comparten el mismo dominio.
let API_BASE = '/api/mediamtx/v3';

/**
 * Une el endpoint con la base evitando errores de barras duplicadas.
 * @example unirRutaApi('/paths') => '/api/mediamtx/v3/paths'
 */
function unirRutaApi(endpoint) {
    let base = API_BASE.replace(/\/$/, ''); // Quita barra final de la base
    let path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint; // Quita barra inicial del endpoint
    return `${base}/${path}`;
}

/**
 * Construye una URL completa incluyendo parámetros de consulta (Query Params).
 * Limpia automáticamente valores nulos o vacíos.
 */
function construirUrlApi(endpoint, query = {}) {
    let url = new URL(unirRutaApi(endpoint), window.location.origin);

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
async function leerRespuestaApi(response) {
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
        endpoint = construirUrlApi(endpoint, query).toString();
    } else {
        endpoint = new URL(unirRutaApi(endpoint), window.location.origin).toString();
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
        let errorPayload = await leerRespuestaApi(response).catch(() => null);
        let errorMessage = typeof errorPayload === 'string'
            ? errorPayload
            : errorPayload?.message || errorPayload?.error || null;

        throw new Error(errorMessage || `Error HTTPS ${response.status}`);
    }

    return await leerRespuestaApi(response);
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

async function DELETE(endpoint, options = {}) {
    return request('DELETE', endpoint, options);
}

