/**
 * GESTIÓN DE GRABACIONES - MEDIAMTX
 * Permite listar grabaciones y borrar segmentos concretos desde la interfaz.
 */

// Referencias al DOM para el listado de grabaciones y el formulario de borrado.
let recordingsManagementEl = document.getElementById('recordingsManagement');
let deleteRecPathEl = document.getElementById('deleteRecPath');
let deleteRecStartEl = document.getElementById('deleteRecStart');

/**
 * Carga el listado de grabaciones y pinta sus segmentos en pantalla.
 */
async function loadRecordings() {
    let container = recordingsManagementEl;

    try {
        container.innerHTML = '<div class="empty-state">Loading recordings...</div>';

        let data = await GET('/recordings/list');

        // No hay grabaciones
        if (!data.items || data.items.length === 0) {
            container.innerHTML = '<div class="empty-state">No recordings</div>';
            markAccordionLoaded('recordingsAccordion');
            return;
        }

        // Hay grabaciones -> Crear elementos
        container.innerHTML = '';
        data.items.forEach(recording => {
            let pathDiv = document.createElement('div');
            pathDiv.className = 'recording-path';

            let segmentsHTML = '';
            if (recording.segments && recording.segments.length > 0) {
                segmentsHTML = '<div class="recording-segments">';
                recording.segments.forEach(segment => {
                    let startDate = new Date(segment.start);
                    segmentsHTML += `
                        <div class="recording-segment">
                            <div class="segment-info">
                                <strong>${escapeHtml(startDate.toLocaleDateString())}</strong> ${escapeHtml(startDate.toLocaleTimeString())}
                            </div>
                            <button class="btn-danger btn-small" onclick='deleteRecordingSegmentConfirm(${JSON.stringify(recording.name)}, ${JSON.stringify(segment.start)})'>🗑️</button>
                        </div>
                    `;
                });
                segmentsHTML += '</div>';
            }

            // Poner si hay segmentos o no hay en la grabacion
            pathDiv.innerHTML = `
                <div class="recording-path-name">📁 ${escapeHtml(recording.name)}</div>
                ${segmentsHTML || '<div class="empty-state">No segments</div>'}
            `;

            container.appendChild(pathDiv);
        });

        markAccordionLoaded('recordingsAccordion');
    } catch (error) {
        console.error('Error loading recordings:', error);
        container.innerHTML = `<div class="empty-state">❌ Error: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Lee el formulario rápido y delega en la función de borrado confirmada.
 */
async function deleteRecordingSegment() {
    let path = deleteRecPathEl.value.trim();
    let start = deleteRecStartEl.value.trim();

    if (!path || !start) {
        alert('Please complete all fields');
        return;
    }

    await deleteRecordingSegmentConfirm(path, start);
}

/**
 * Borra un segmento concreto de grabación pidiendo confirmación previa.
 * @param {string} path - Ruta de la grabación.
 * @param {string} start - Marca de inicio del segmento.
 */
async function deleteRecordingSegmentConfirm(path, start) {
    if (!confirm(`Delete recording segment?\nPath: ${path}\nStart: ${start}`)) return;

    try {
        await POST('/recordings/deletesegment', { path, start });

        alert('Segment deleted');
        await loadRecordings();

        deleteRecPathEl.value = '';
        deleteRecStartEl.value = '';
    } catch (error) {
        console.error('Error deleting recording segment:', error);
        alert('Error: ' + error.message);
    }
}
