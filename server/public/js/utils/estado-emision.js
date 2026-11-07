/**
 * MÁQUINA DE ESTADOS DE LA EMISIÓN (broadcaster)
 *
 * Única fuente de verdad sobre en qué punto está la emisión. Antes el estado
 * salía de combinar pc, localStream, whipSession, isStoppingBroadcast, el
 * temporizador de gracia ICE y hasta la clase CSS de la píldora de estado.
 *
 *   inactivo ─► previsualizando ─► abriendo ─► negociando ─► esperando_trafico ─► en_antena ⇄ inestable
 *       ▲              │               │            │                │                 │           │
 *       │              └───────────────┴─── error ◄─┴────────────────┘                 │           │
 *       └──────────────────────────── deteniendo ◄─────────────────────────────────────┴───────────┘
 *
 * - cambiarEstadoEmision() rechaza (y registra) las transiciones no previstas:
 *   una combinación imposible ya no se puede alcanzar en silencio.
 * - Las acciones de entrada/salida viven aquí (p. ej. el temporizador de gracia
 *   ICE existe solo mientras se está en 'inestable').
 * - La UI se pinta solo desde el estado (pintarEstadoEmision en broadcaster-ui.js).
 */

const ESTADOS_EMISION = Object.freeze({
    INACTIVO: 'inactivo',
    PREVISUALIZANDO: 'previsualizando',
    ABRIENDO: 'abriendo',               // getUserMedia en curso
    NEGOCIANDO: 'negociando',           // ICE + intercambio SDP con WHIP
    ESPERANDO_TRAFICO: 'esperando_trafico',
    EN_ANTENA: 'en_antena',
    INESTABLE: 'inestable',             // ICE 'disconnected', dentro del margen de gracia
    DETENIENDO: 'deteniendo',
    ERROR: 'error'
});

const E = ESTADOS_EMISION;

// Transiciones permitidas: estado -> estados a los que se puede ir
const TRANSICIONES_EMISION = Object.freeze({
    [E.INACTIVO]: [E.PREVISUALIZANDO, E.ABRIENDO, E.ERROR],
    [E.PREVISUALIZANDO]: [E.PREVISUALIZANDO, E.ABRIENDO, E.INACTIVO, E.ERROR],
    [E.ERROR]: [E.PREVISUALIZANDO, E.ABRIENDO, E.INACTIVO, E.ERROR],
    [E.ABRIENDO]: [E.NEGOCIANDO, E.DETENIENDO],
    [E.NEGOCIANDO]: [E.ESPERANDO_TRAFICO, E.INESTABLE, E.DETENIENDO],
    [E.ESPERANDO_TRAFICO]: [E.EN_ANTENA, E.INESTABLE, E.DETENIENDO],
    [E.EN_ANTENA]: [E.INESTABLE, E.DETENIENDO],
    [E.INESTABLE]: [E.EN_ANTENA, E.ESPERANDO_TRAFICO, E.NEGOCIANDO, E.DETENIENDO],
    [E.DETENIENDO]: [E.INACTIVO, E.ERROR]
});

// Agrupaciones que usa el resto del código en vez de mirar variables sueltas
const ESTADOS_SIN_EMISION = new Set([E.INACTIVO, E.PREVISUALIZANDO, E.ERROR]);
const ESTADOS_EN_AIRE = new Set([E.EN_ANTENA, E.INESTABLE]);

let estadoEmision = E.INACTIVO;
let mensajeErrorEmision = '';
let estadoPrevioInestable = null;   // a dónde volver si ICE se recupera
let temporizadorGraciaIce = null;

// Margen ante ICE 'disconnected' (micro-cortes de wifi/4G) antes de cortar la emisión
const GRACIA_ICE_EMISOR_MS = 4000;

/**
 * Cambia de estado si la transición está permitida y ejecuta las acciones de
 * salida/entrada. Devuelve false (sin tocar nada) si no lo está.
 * @param {string} nuevo - Uno de ESTADOS_EMISION.
 * @param {{mensaje?: string}} [contexto]
 * @returns {boolean}
 */
function cambiarEstadoEmision(nuevo, contexto = {}) {
    let actual = estadoEmision;
    let permitidos = TRANSICIONES_EMISION[actual] || [];
    if (!permitidos.includes(nuevo)) {
        console.warn(`[emisión] transición no permitida: ${actual} -> ${nuevo}`);
        return false;
    }

    salirDeEstadoEmision(actual, nuevo);
    estadoEmision = nuevo;
    mensajeErrorEmision = nuevo === E.ERROR ? (contexto.mensaje || 'Error') : '';
    entrarEnEstadoEmision(nuevo, actual);

    console.log(`[emisión] ${actual} -> ${nuevo}`);
    if (typeof pintarEstadoEmision === 'function') pintarEstadoEmision(nuevo, { mensaje: mensajeErrorEmision });
    return true;
}

function salirDeEstadoEmision(estado) {
    if (estado === E.INESTABLE) {
        clearTimeout(temporizadorGraciaIce);
        temporizadorGraciaIce = null;
    }
}

function entrarEnEstadoEmision(estado, anterior) {
    if (estado === E.INESTABLE) {
        estadoPrevioInestable = anterior;
        temporizadorGraciaIce = setTimeout(() => {
            if (estadoEmision === E.INESTABLE) {
                mostrarAviso('Emisión detenida: se perdió la conexión con el servidor.', 'error');
                stopBroadcast({ error: 'Se perdió la conexión con el servidor' });
            }
        }, GRACIA_ICE_EMISOR_MS);
    }
}

/**
 * Vuelta desde 'inestable' al estado en el que estaba antes del corte.
 */
function recuperarDeInestable() {
    if (estadoEmision !== E.INESTABLE) return;
    cambiarEstadoEmision(estadoPrevioInestable || E.EN_ANTENA);
}

/** ¿Se puede empezar a emitir (o previsualizar) ahora? */
function sinEmisionEnCurso() {
    return ESTADOS_SIN_EMISION.has(estadoEmision);
}
