/**
 * INICIO: qué está en directo ahora
 * Sondea /paths/list cada pocos segundos y lista las cámaras listas con
 * accesos directos (ver, repetir, copiar la URL de salida para OBS).
 */

const INICIO_SONDEO_MS = 4000;

const listaDirecto = document.getElementById('listaDirecto');
const resumenDirecto = document.getElementById('resumenDirecto');

let firmaDirecto = null;

function urlAbsoluta(ruta) {
    return new URL(ruta, window.location.href).toString();
}

function horaCorta(fechaIso) {
    const fecha = new Date(fechaIso);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function nombresPistas(path) {
    // MediaMTX v3 expone 'tracks' (nombres de códec) y, en versiones recientes, 'tracks2'
    const pistas = Array.isArray(path.tracks) ? path.tracks : [];
    return pistas.map((pista) => (typeof pista === 'string' ? pista : pista?.codec)).filter(Boolean);
}

function crearItemDirecto(path) {
    const nombre = path.name;
    const item = document.createElement('li');
    item.className = 'directo__item';
    aplicarColorCamara(item, nombre);

    const espectadores = Array.isArray(path.readers) ? path.readers.length : 0;
    const desde = path.readyTime ? horaCorta(path.readyTime) : '';
    const pistas = nombresPistas(path);
    const urlObs = urlAbsoluta(`neoplayer.html?stream=${encodeURIComponent(nombre)}`);

    item.innerHTML = `
        <span class="directo__color" aria-hidden="true"></span>
        <div class="directo__nombre">
            <strong>${escapeHtml(nombre)}</strong>
            <span class="pistas">${pistas.map((p) => `<span class="pista">${escapeHtml(p)}</span>`).join('')}</span>
        </div>
        <dl class="directo__datos">
            <div><dt>Desde</dt><dd class="cifra">${escapeHtml(desde || '—')}</dd></div>
            <div><dt>Viendo</dt><dd class="cifra">${espectadores}</dd></div>
        </dl>
        <div class="directo__acciones">
            <a class="boton boton--peq" href="player.html?stream=${encodeURIComponent(nombre)}">
                <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#ojo"/></svg>Ver
            </a>
            <a class="boton boton--peq" href="playback.html?stream=${encodeURIComponent(nombre)}">
                <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#repetir"/></svg>Repetir
            </a>
            <button type="button" class="boton boton--peq boton--fantasma" data-url="${escapeHtml(urlObs)}">
                <svg class="icono" aria-hidden="true"><use href="img/iconos.svg#copiar"/></svg>URL para OBS
            </button>
        </div>`;
    return item;
}

function pintarDirecto(paths) {
    const listos = paths.filter((p) => p.ready).sort((a, b) => a.name.localeCompare(b.name));
    const firma = JSON.stringify(listos.map((p) => [p.name, p.readyTime, (p.readers || []).length, nombresPistas(p)]));
    if (firma === firmaDirecto) return;
    firmaDirecto = firma;

    resumenDirecto.textContent = listos.length === 1
        ? '1 cámara emitiendo'
        : `${listos.length} cámaras emitiendo`;

    listaDirecto.replaceChildren();
    if (!listos.length) {
        const vacio = document.createElement('li');
        vacio.className = 'vacio';
        vacio.innerHTML = '<strong>Ninguna cámara está emitiendo.</strong> Abre <a href="broadcaster.html">Emitir</a> en un móvil o portátil, o publica por RTSP/SRT/WHIP en este servidor.';
        listaDirecto.appendChild(vacio);
        return;
    }
    for (const path of listos) listaDirecto.appendChild(crearItemDirecto(path));
}

async function actualizarDirecto() {
    try {
        const datos = await GET('/paths/list');
        pintarDirecto(datos?.items || []);
    } catch (error) {
        firmaDirecto = null;
        resumenDirecto.textContent = 'Sin conexión con MediaMTX';
        listaDirecto.innerHTML = `<li class="vacio"><strong>No se pudo consultar MediaMTX.</strong> Comprueba que el contenedor está en marcha (<code>docker compose ps</code>). Detalle: ${escapeHtml(error.message)}</li>`;
    }
}

async function copiarTexto(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        mostrarAviso('URL copiada', 'ok');
    } catch {
        mostrarAviso(`No se pudo copiar automáticamente. URL: ${texto}`, 'aviso', 0);
    }
}

// Botones de copiar (delegación: la lista se repinta)
document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-url], button[data-copiar]');
    if (!boton) return;
    const texto = boton.dataset.url || document.getElementById(boton.dataset.copiar)?.value;
    if (texto) copiarTexto(texto);
});

document.getElementById('urlDisplay').value = urlAbsoluta('display.html');
document.getElementById('urlNeoplayer').value = urlAbsoluta('neoplayer.html?stream=cam1');

actualizarDirecto();
setInterval(() => {
    if (!document.hidden) actualizarDirecto();
}, INICIO_SONDEO_MS);
