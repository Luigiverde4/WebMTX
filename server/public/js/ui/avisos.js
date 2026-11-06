/**
 * AVISOS Y CONFIRMACIONES dentro de la página
 * Sustituyen a alert()/confirm(): no bloquean la página (ni una fuente de
 * navegador de OBS) y respetan el estilo del sistema de diseño.
 *
 *   mostrarAviso('Emisión detenida', 'ok')            // tipos: info | ok | aviso | error
 *   if (await confirmar('¿Reemplazar al emisor?', { aceptar: 'Reemplazar' })) { ... }
 */

const AVISO_DURACION_MS = { info: 4000, ok: 3500, aviso: 7000, error: 9000 };

function contenedorAvisos() {
    let region = document.getElementById('avisos');
    if (!region) {
        region = document.createElement('div');
        region.id = 'avisos';
        region.className = 'avisos';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }
    return region;
}

/**
 * Muestra un aviso temporal en la esquina inferior derecha.
 * @param {string} texto
 * @param {'info'|'ok'|'aviso'|'error'} [tipo='info']
 * @param {number} [duracionMs] - 0 = no se cierra solo
 */
function mostrarAviso(texto, tipo = 'info', duracionMs) {
    const region = contenedorAvisos();
    const aviso = document.createElement('div');
    aviso.className = `aviso aviso--${tipo}`;
    if (tipo === 'error') aviso.setAttribute('role', 'alert');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'aviso__texto';
    cuerpo.textContent = texto;

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'aviso__cerrar';
    cerrar.setAttribute('aria-label', 'Cerrar aviso');
    cerrar.textContent = '×';
    cerrar.addEventListener('click', () => aviso.remove());

    aviso.append(cuerpo, cerrar);
    region.appendChild(aviso);

    // Máximo 4 avisos a la vez: el más antiguo se va
    while (region.children.length > 4) region.firstElementChild.remove();

    const duracion = duracionMs ?? AVISO_DURACION_MS[tipo] ?? 4000;
    if (duracion > 0) setTimeout(() => aviso.remove(), duracion);
    return aviso;
}

/**
 * Pide confirmación con un <dialog> modal. Devuelve una Promise<boolean>.
 * @param {string} texto
 * @param {{aceptar?: string, cancelar?: string, peligro?: boolean}} [opciones]
 */
function confirmar(texto, opciones = {}) {
    const { aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false } = opciones;

    // Navegadores sin <dialog>: recurso al confirm nativo
    if (typeof HTMLDialogElement !== 'function') {
        return Promise.resolve(window.confirm(texto));
    }

    return new Promise((resolver) => {
        const dialogo = document.createElement('dialog');
        dialogo.className = 'dialogo';

        const p = document.createElement('p');
        p.className = 'dialogo__texto';
        p.textContent = texto;

        const acciones = document.createElement('div');
        acciones.className = 'dialogo__acciones';

        const botonCancelar = document.createElement('button');
        botonCancelar.type = 'button';
        botonCancelar.className = 'boton';
        botonCancelar.textContent = cancelar;

        const botonAceptar = document.createElement('button');
        botonAceptar.type = 'button';
        botonAceptar.className = peligro ? 'boton boton--peligro' : 'boton boton--primario';
        botonAceptar.textContent = aceptar;

        acciones.append(botonCancelar, botonAceptar);
        dialogo.append(p, acciones);
        document.body.appendChild(dialogo);

        let respuesta = false;
        botonCancelar.addEventListener('click', () => dialogo.close());
        botonAceptar.addEventListener('click', () => { respuesta = true; dialogo.close(); });
        dialogo.addEventListener('close', () => {
            dialogo.remove();
            resolver(respuesta);
        });

        dialogo.showModal();
        botonAceptar.focus();
    });
}
