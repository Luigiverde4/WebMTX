/**
 * BARRA DE TALLY
 * Estado global de la página bajo la cabecera, con la semántica de los pilotos
 * de cámara: rojo = en antena, verde = recibiendo, ámbar = conectando.
 *
 * HTML esperado:
 *   <div class="tally" id="tally" data-estado="inactivo">
 *     <span class="tally__lampara" aria-hidden="true"></span>
 *     <span class="tally__estado" id="tallyEstado">…</span>
 *     <span class="tally__detalle" id="tallyDetalle"></span>
 *     <span class="tally__tiempo" id="tallyTiempo"></span>
 *   </div>
 *
 *   ponerTally('antena', { estado: 'En antena', detalle: 'cam1', cronometro: true })
 *   ponerTally('inactivo', { estado: 'Sin emitir' })
 */

const TALLY = { inicio: null, temporizador: null };

function formatearCronometro(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * @param {'inactivo'|'conectando'|'antena'|'recibiendo'|'error'} estado
 * @param {{estado?: string, detalle?: string, cronometro?: boolean, tiempo?: string}} [textos]
 *   cronometro: cuenta el tiempo desde que se entra en este estado (se mantiene
 *   si se vuelve a llamar con el mismo estado y cronometro: true).
 */
function ponerTally(estado, textos = {}) {
    const barra = document.getElementById('tally');
    if (!barra) return;
    const estadoPrevio = barra.dataset.estado;
    barra.dataset.estado = estado;

    const etiqueta = document.getElementById('tallyEstado');
    const detalle = document.getElementById('tallyDetalle');
    const tiempo = document.getElementById('tallyTiempo');
    if (etiqueta && textos.estado !== undefined) etiqueta.textContent = textos.estado;
    if (detalle) detalle.textContent = textos.detalle || '';

    if (textos.cronometro) {
        if (estadoPrevio !== estado || !TALLY.inicio) TALLY.inicio = Date.now();
        if (!TALLY.temporizador) {
            const pintar = () => {
                if (tiempo && TALLY.inicio) tiempo.textContent = formatearCronometro(Date.now() - TALLY.inicio);
            };
            pintar();
            TALLY.temporizador = setInterval(pintar, 1000);
        }
    } else {
        clearInterval(TALLY.temporizador);
        TALLY.temporizador = null;
        TALLY.inicio = null;
        if (tiempo) tiempo.textContent = textos.tiempo || '';
    }
}
