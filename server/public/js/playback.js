/**
 * NUCLEO DEL REPRODUCTOR DE GRABACIONES
 * Gestiona la consulta y reproducción de segmentos grabados.
 */

/**
 * Carga las grabaciones disponibles desde los endpoints de grabación.
 */
async function loadRecordings() {
    try {
        recordingsListEl.innerHTML = '<div class="empty-state"><p>⏳ Cargando grabaciones...</p></div>';

        // Usar proxy del backend para evitar errores de red/CORS en el navegador.
        let pathsResponse = await fetch('/api/mediamtx/v3/recordings/list');
        if (!pathsResponse.ok) {
            throw new Error(`HTTP ${pathsResponse.status}: ${pathsResponse.statusText}`);
        }

        let pathsData = await pathsResponse.json();

        if (!pathsData.items || pathsData.items.length === 0) {
            recordingsListEl.innerHTML = '<div class="empty-state"><p>🎬 No hay grabaciones disponibles</p></div>';
            recordingCountEl.textContent = '0 grabaciones';
            return;
        }

        allRecordings = [];
        for (let item of pathsData.items) {
            let listURL = `/api/playback/list?path=${encodeURIComponent(item.name)}`;
            let response = await fetch(listURL);
            if (!response.ok) continue;

            let segments = await response.json();
            segments.forEach(segment => {
                allRecordings.push({
                    stream: item.name,
                    start: new Date(segment.start),
                    duration: segment.duration,
                    startISO: segment.start,
                    url: segment.url
                });
            });
        }

        if (allRecordings.length === 0) {
            recordingsListEl.innerHTML = '<div class="empty-state"><p>🎬 No hay grabaciones disponibles</p></div>';
            recordingCountEl.textContent = '0 grabaciones';
            return;
        }

        allRecordings.sort((a, b) => b.start - a.start);
        actualizarFiltroStream();
        mostrarGrabaciones(allRecordings);

        recordingCountEl.textContent = `${allRecordings.length} grabación${allRecordings.length !== 1 ? 'es' : ''}`;
    } catch (error) {
        console.error('Error al cargar grabaciones:', error);
        recordingsListEl.innerHTML = `
            <div class="empty-state">
                <p>❌ Error al cargar grabaciones</p>
                <p class="hint">${error.message}</p>
                <p class="hint">Asegúrate de que MediaMTX está ejecutándose</p>
            </div>
        `;
        alert('Error al cargar grabaciones: ' + error.message);
    }
}

/**
 * Reproduce una grabación concreta y sincroniza la UI con su duración.
 * @param {Object} recording - Segmento de grabación seleccionado.
 */
function playRecording(recording) {
    selectedRecording = recording;
    actualizarGrabacionSeleccionada();

    startOffsetInput.max = Math.floor(recording.duration);
    startOffsetInput.value = 0;
    timelineSlider.max = Math.floor(recording.duration);
    timelineSlider.value = 0;
    timelineSlider.disabled = false;

    let startDate = new Date(recording.start);
    let endDate = new Date(startDate.getTime() + recording.duration * 1000);
    timelineStart.textContent = formatTimeOnly(startDate);
    timelineEnd.textContent = formatTimeOnly(endDate);

    playFromOffset();
}

/**
 * Calcula la ventana temporal a reproducir y lanza el vídeo.
 */
function playFromOffset() {
    if (!selectedRecording) {
        alert('Por favor, selecciona una grabación primero');
        return;
    }

    let mode = document.querySelector('input[name="playbackMode"]:checked').value;

    let offset = 0;
    let newDuration = selectedRecording.duration;

    if (mode === 'offset') {
        offset = parseFloat(startOffsetInput.value) || 0;
        newDuration = selectedRecording.duration - offset;

        if (offset > selectedRecording.duration) {
            alert('El offset es mayor que la duración de la grabación');
            return;
        }
    } else {
        let lookbackSeconds = parseFloat(lookbackTimeInput.value) || 60;
        let now = new Date();
        let recordingStart = new Date(selectedRecording.start);
        let recordingEnd = new Date(recordingStart.getTime() + selectedRecording.duration * 1000);

        if (now < recordingStart) {
            alert('La grabación aún no ha comenzado');
            return;
        }

        let startPoint = new Date(now.getTime() - lookbackSeconds * 1000);

        if (startPoint < recordingStart) {
            offset = 0;
            let endPoint = now < recordingEnd ? now : recordingEnd;
            newDuration = (endPoint.getTime() - recordingStart.getTime()) / 1000;

            if (newDuration <= 0) {
                alert('No hay contenido disponible en ese rango');
                return;
            }
        } else if (startPoint > recordingEnd) {
            alert('El tiempo solicitado está más allá del final de la grabación');
            return;
        } else {
            offset = (startPoint.getTime() - recordingStart.getTime()) / 1000;
            let endPoint = now < recordingEnd ? now : recordingEnd;
            newDuration = (endPoint.getTime() - startPoint.getTime()) / 1000;

            if (newDuration <= 0) {
                alert('No hay contenido disponible en ese rango');
                return;
            }
        }
    }

    if (newDuration <= 0) {
        alert('La duración calculada no es válida');
        return;
    }

    let originalStart = new Date(selectedRecording.start);
    let newStart = new Date(originalStart.getTime() + offset * 1000);
    let startISO = newStart.toISOString();
    let playURL = `/api/playback/get?duration=${encodeURIComponent(newDuration)}&path=${encodeURIComponent(selectedRecording.stream)}&start=${encodeURIComponent(startISO)}`;

    console.log('Modo:', mode);
    console.log('Offset:', offset.toFixed(2), 's');
    console.log('Duración:', newDuration.toFixed(2), 's');
    console.log('URL:', playURL);

    let now = new Date();
    let recordingEnd = new Date(originalStart.getTime() + selectedRecording.duration * 1000);
    let secondsSinceEnd = (now - recordingEnd) / 1000;

    if (secondsSinceEnd < 10 && secondsSinceEnd > 0) {
        console.warn('Advertencia: Grabación muy reciente, puede no estar completamente disponible');
    }

    video.src = playURL;
    video.load();
    video.play().catch(err => {
        console.error('Error al reproducir:', err);
        alert('⚠️ No se pudo iniciar la reproducción. El segmento puede no estar disponible aún.');
    });

    let offsetText = '';
    if (mode === 'offset' && offset > 0) {
        offsetText = ` (desde +${offset.toFixed(0)}s)`;
    } else if (mode === 'lookback') {
        let lookback = parseFloat(lookbackTimeInput.value) || 60;
        offsetText = ` (últimos ${lookback}s)`;
    }
    currentRecordingEl.textContent = `${selectedRecording.stream} - ${formatDate(originalStart)}${offsetText}`;
}