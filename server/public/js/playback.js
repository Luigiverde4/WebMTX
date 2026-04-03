/**
 * REPRODUCTOR DE GRABACIONES - MEDIA MTX
 * Gestiona la consulta y reproducción de segmentos grabados.
 */

// Elementos DOM
let video = document.getElementById('video');


// Información de reproducción
let speedDisplay = document.getElementById('speedDisplay');
let timeDisplay = document.getElementById('timeDisplay');
 
// Información de las grabaciones disponibles y seleccionadas
let currentRecordingEl = document.getElementById('currentRecording');
let recordingCountEl = document.getElementById('recordingCount');
let recordingsListEl = document.getElementById('recordingsList');

// Filtros y parámetros de reproducción
let streamFilterEl = document.getElementById('streamFilter');
let startOffsetInput = document.getElementById('startOffset');

// Reproducción en modo lookback
let lookbackTimeInput = document.getElementById('lookbackTime');

// Controles de timeline
let timelineSlider = document.getElementById('timelineSlider');
let timelineStart = document.getElementById('timelineStart');
let timelineEnd = document.getElementById('timelineEnd');


// Estado global
let allRecordings = [];
let selectedRecording = null;

// Interfaz
/**
 * Alterna entre el modo de reproducción por offset y el modo lookback.
 */
function updatePlaybackMode() {
    let mode = document.querySelector('input[name="playbackMode"]:checked').value;
    let offsetControls = document.getElementById('offsetControls');
    let lookbackControls = document.getElementById('lookbackControls');
    
    if (mode === 'offset') {
        offsetControls.style.display = 'flex';
        lookbackControls.style.display = 'none';
    } else {
        offsetControls.style.display = 'none';
        lookbackControls.style.display = 'flex';
    }
}

/**
 * Resalta en la lista la grabación actualmente seleccionada.
 */
function updateSelectedRecording() {
    document.querySelectorAll('.recording-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    if (selectedRecording) {
        let items = document.querySelectorAll('.recording-item');
        let selectedDate = formatDate(selectedRecording.start);
        items.forEach(item => {
            if (item.textContent.includes(selectedRecording.stream) && 
                item.textContent.includes(selectedDate)) {
                item.classList.add('selected');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
}

// Filtro de streams
/**
 * Rellena el selector con los streams presentes en las grabaciones.
 */
function updateStreamFilter() {
    let streams = [...new Set(allRecordings.map(r => r.stream))].sort();
    
    streamFilterEl.innerHTML = '<option value="all">Todos los streams</option>';
    streams.forEach(stream => {
        let option = document.createElement('option');
        option.value = stream;
        option.textContent = stream;
        streamFilterEl.appendChild(option);
    });
}

/**
 * Filtra las grabaciones según el stream seleccionado.
 */
function filterRecordings() {
    let selectedStream = streamFilterEl.value;
    
    if (selectedStream === 'all') {
        displayRecordings(allRecordings);
    } else {
        let filtered = allRecordings.filter(r => r.stream === selectedStream);
        displayRecordings(filtered);
    }
}

/**
 * Renderiza la lista de grabaciones en pantalla.
 * @param {Array<Object>} recordings - Lista de segmentos a mostrar.
 */
function displayRecordings(recordings) {
    if (recordings.length === 0) {
        recordingsListEl.innerHTML = '<div class="empty-state"><p>🎬 No hay grabaciones para este filtro</p></div>';
        return;
    }

    recordingsListEl.innerHTML = '';
    
    recordings.forEach((recording, index) => {
        let item = document.createElement('div');
        item.className = 'recording-item';
        item.onclick = () => playRecording(recording);
        
        let formattedDate = formatDate(recording.start);
        let formattedDuration = formatDuration(recording.duration);
        let formattedTime = formatTime(recording.duration);
        
        item.innerHTML = `
            <div class="recording-header">
                <span class="recording-stream">📹 ${recording.stream}</span>
                <span class="recording-date">${formattedDate}</span>
            </div>
            <div class="recording-filename">
                Duración: ${formattedDuration} (${formattedTime})
            </div>
        `;
        
        recordingsListEl.appendChild(item);
    });
}

/**
 * Carga las grabaciones disponibles desde los endpoints de grabación.
 */
async function loadRecordings() {
    let server = document.getElementById('server').value;
    
    try {
        recordingsListEl.innerHTML = '<div class="empty-state"><p>⏳ Cargando grabaciones...</p></div>';
        
        // Obtener la lista de paths con grabaciones.
        let pathsURL = `http://${server}:9997/v3/recordings/list`;
        let pathsResponse = await fetch(pathsURL);
        if (!pathsResponse.ok) {
            throw new Error(`HTTP ${pathsResponse.status}: ${pathsResponse.statusText}`);
        }
        
        let pathsData = await pathsResponse.json();
        
        if (!pathsData.items || pathsData.items.length === 0) {
            recordingsListEl.innerHTML = '<div class="empty-state"><p>🎬 No hay grabaciones disponibles</p></div>';
            recordingCountEl.textContent = '0 grabaciones';
            return;
        }
        
        // Obtener los segmentos de cada path.
        allRecordings = [];
        for (let item of pathsData.items) {
            let listURL = `http://${server}:9996/list?path=${encodeURIComponent(item.name)}`;
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

        // Ordenar por fecha, primero las más recientes.
        allRecordings.sort((a, b) => b.start - a.start);
        
        // Actualizar el selector de streams.
        updateStreamFilter();
        
        // Pintar la lista final.
        displayRecordings(allRecordings);
        
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



// Reproducción
/**
 * Reproduce una grabación concreta y sincroniza la UI con su duración.
 * @param {Object} recording - Segmento de grabación seleccionado.
 */
function playRecording(recording) {
    // Actualizar la interfaz con la selección actual.
    selectedRecording = recording;
    updateSelectedRecording();
    
    // Configurar los controles de tiempo.
    startOffsetInput.max = Math.floor(recording.duration);
    startOffsetInput.value = 0;
    timelineSlider.max = Math.floor(recording.duration);
    timelineSlider.value = 0;
    timelineSlider.disabled = false;
    
    // Actualizar el timeline visible.
    let startDate = new Date(recording.start);
    let endDate = new Date(startDate.getTime() + recording.duration * 1000);
    timelineStart.textContent = formatTimeOnly(startDate);
    timelineEnd.textContent = formatTimeOnly(endDate);
    
    // Iniciar la reproducción desde el origen seleccionado.
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
    
    let server = document.getElementById('server').value;
    let mode = document.querySelector('input[name="playbackMode"]:checked').value;
    
    let offset = 0;
    let newDuration = selectedRecording.duration;
    
    if (mode === 'offset') {
        // Modo offset: avanzar desde el inicio del segmento.
        offset = parseFloat(startOffsetInput.value) || 0;
        newDuration = selectedRecording.duration - offset;
        
        if (offset > selectedRecording.duration) {
            alert('El offset es mayor que la duración de la grabación');
            return;
        }
    } else {
        // Modo lookback: retroceder desde el instante actual.
        let lookbackSeconds = parseFloat(lookbackTimeInput.value) || 60;
        let now = new Date();
        let recordingStart = new Date(selectedRecording.start);
        let recordingEnd = new Date(recordingStart.getTime() + selectedRecording.duration * 1000);
        
        // Verificar que la grabación ya haya comenzado.
        if (now < recordingStart) {
            alert('La grabación aún no ha comenzado');
            return;
        }
        
        // Calcular el punto de inicio según la ventana lookback.
        let startPoint = new Date(now.getTime() - lookbackSeconds * 1000);
        
        // Si la ventana empieza antes de la grabación, recortar al inicio.
        if (startPoint < recordingStart) {
            offset = 0;
            // Reproducir desde el inicio hasta ahora, o hasta el final si ya terminó.
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
            // La ventana solicitada cae dentro del segmento.
            offset = (startPoint.getTime() - recordingStart.getTime()) / 1000;
            // Duración desde el inicio calculado hasta el instante actual.
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
    
    // Calcular la nueva marca de inicio absoluta.
    let originalStart = new Date(selectedRecording.start);
    let newStart = new Date(originalStart.getTime() + offset * 1000);
    
    // letruir la URL de reproducción.
    let startISO = newStart.toISOString();
    let playURL = `http://${server}:9996/get?duration=${newDuration}&path=${encodeURIComponent(selectedRecording.stream)}&start=${encodeURIComponent(startISO)}`;
    
    console.log('Modo:', mode);
    console.log('Offset:', offset.toFixed(2), 's');
    console.log('Duración:', newDuration.toFixed(2), 's');
    console.log('URL:', playURL);
    
    // Avisar si el segmento aún puede no estar completamente disponible.
    let now = new Date();
    let recordingEnd = new Date(originalStart.getTime() + selectedRecording.duration * 1000);
    let secondsSinceEnd = (now - recordingEnd) / 1000;
    
    if (secondsSinceEnd < 10 && secondsSinceEnd > 0) {
        console.warn('Advertencia: Grabación muy reciente, puede no estar completamente disponible');
    }
    
    // Reproducir el vídeo.
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


// Formateo de fechas
/**
 * Formatea una fecha completa en formato local.
 * @param {Date} date - Fecha a formatear.
 */
function formatDate(date) {
    let day = String(date.getDate()).padStart(2, '0');
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let year = date.getFullYear();
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formatea únicamente la hora de una fecha.
 * @param {Date} date - Fecha a formatear.
 */
function formatTimeOnly(date) {
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Convierte una duración en segundos a una etiqueta legible.
 * @param {number} seconds - Duración en segundos.
 */
function formatDuration(seconds) {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

/**
 * Formatea un tiempo en mm:ss o hh:mm:ss.
 * @param {number} seconds - Tiempo en segundos.
 */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Control de velocidad
/**
 * Ajusta la velocidad de reproducción del vídeo.
 * @param {number} speed - Velocidad deseada.
 */
function setSpeed(speed) {
    video.playbackRate = speed;
    speedDisplay.textContent = speed.toFixed(2) + 'x';
}

/**
 * Incrementa o reduce la velocidad actual manteniéndola dentro de rango.
 * @param {number} delta - Variación de velocidad.
 */
function changeSpeed(delta) {
    let newSpeed = Math.max(0.25, Math.min(4, video.playbackRate + delta));
    setSpeed(newSpeed);
}

/**
 * Actualiza la etiqueta con el tiempo transcurrido y total.
 */
function updateTimeDisplay() {
    let current = formatTime(video.currentTime);
    let total = formatTime(video.duration);
    timeDisplay.textContent = `${current} / ${total}`;
}


// Eventos del vídeo
video.addEventListener('timeupdate', updateTimeDisplay);
video.addEventListener('loadedmetadata', updateTimeDisplay);
video.addEventListener('ratechange', () => {
    speedDisplay.textContent = video.playbackRate.toFixed(2) + 'x';
});

// Gestión de errores de carga.
video.addEventListener('error', (e) => {
    console.error('Error al cargar el video:', e);
    let error = video.error;
    let errorMessage = 'Error desconocido al cargar el video';
    
    if (error) {
        switch(error.code) {
            case error.MEDIA_ERR_ABORTED:
                errorMessage = 'Carga del video abortada';
                break;
            case error.MEDIA_ERR_NETWORK:
                errorMessage = 'Error de red al cargar el video';
                break;
            case error.MEDIA_ERR_DECODE:
                errorMessage = 'Error de decodificación del video';
                break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = 'Segmento de grabación no disponible. Puede que la grabación aún se esté procesando o el segmento no exista.';
                break;
        }
    }
    
    alert(`⚠️ ${errorMessage}\n\nSi la grabación es muy reciente, espera unos segundos e intenta de nuevo.`);
    currentRecordingEl.textContent = 'Error al reproducir';
});

// Sincronizar el slider con el campo numérico.
timelineSlider.addEventListener('input', () => {
    startOffsetInput.value = timelineSlider.value;
});

// Mantener ambos controles alineados.
startOffsetInput.addEventListener('input', () => {
    let value = parseFloat(startOffsetInput.value) || 0;
    timelineSlider.value = value;
});

// Arranque inicial.
window.addEventListener('load', () => {
    console.log('MediaMTX Playback Player cargado');
    updateTimeDisplay();
    loadRecordings();
});
