/**
 * RELOJ DE LA CABECERA
 * Hora en directo (HH:MM:SS) arriba a la derecha de todas las páginas de
 * operador. Las horas de las grabaciones las pone el servidor, así que si el
 * reloj de este equipo va desfasado se corrige con la hora del servidor (la
 * cabecera Date de una respuesta, con precisión de segundo).
 *
 * HTML esperado (al final de .cabecera):
 *   <time class="reloj cifra" id="reloj" aria-label="Hora">--:--:--</time>
 */

const RELOJ = { desfaseMs: 0 };

/** Diferencia entre la hora del servidor y la de este equipo (solo si es apreciable). */
async function sincronizarReloj() {
    try {
        let antes = Date.now();
        let respuesta = await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' });
        let despues = Date.now();
        let servidor = Date.parse(respuesta.headers.get('Date'));
        if (Number.isNaN(servidor)) return;
        // Date va en segundos enteros: se compara con el punto medio y se ignora
        // lo que cabe en ese redondeo
        let desfase = servidor + 500 - (antes + despues) / 2;
        RELOJ.desfaseMs = Math.abs(desfase) > 1500 ? desfase : 0;
    } catch {
        // Sin servidor: se queda la hora del equipo
    }
}

function pintarReloj() {
    let reloj = document.getElementById('reloj');
    if (!reloj) return;
    let ahora = new Date(Date.now() + RELOJ.desfaseMs);
    let dos = n => String(n).padStart(2, '0');
    reloj.textContent = `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}:${dos(ahora.getSeconds())}`;
    reloj.dateTime = ahora.toISOString();
    reloj.title = RELOJ.desfaseMs
        ? `Hora del servidor (este equipo va ${Math.round(RELOJ.desfaseMs / 1000)} s desfasado)`
        : 'Hora';
}

document.addEventListener('DOMContentLoaded', () => {
    pintarReloj();
    // Se repinta en cada cambio de segundo, no cada 1000 ms sueltos (evita saltos)
    let siguienteSegundo = () => setTimeout(() => { pintarReloj(); siguienteSegundo(); }, 1000 - ((Date.now() + RELOJ.desfaseMs) % 1000) + 5);
    siguienteSegundo();
    sincronizarReloj().then(pintarReloj);
});
