/**
 * UI DEL REPRODUCTOR DE GRABACIONES
 * Gestiona DOM, render y eventos visuales.
 */

/**
 * ELEMENTOS DOM
 */
let video = document.getElementById('video');
let speedDisplay = document.getElementById('speedDisplay');
let timeDisplay = document.getElementById('timeDisplay');
let currentRecordingEl = document.getElementById('currentRecording');
let recordingCountEl = document.getElementById('recordingCount');
let recordingsListEl = document.getElementById('recordingsList');
let streamFilterEl = document.getElementById('streamFilter');
let startOffsetInput = document.getElementById('startOffset');
let lookbackTimeInput = document.getElementById('lookbackTime');
let timelineSlider = document.getElementById('timelineSlider');
let timelineStart = document.getElementById('timelineStart');
let timelineEnd = document.getElementById('timelineEnd');

/**
 * ESTADO GLOBAL
 */
let allRecordings = [];
let selectedRecording = null;




// FUNCIONES DE UI
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
            if (item.textContent.includes(selectedRecording.stream) && item.textContent.includes(selectedDate)) {
                item.classList.add('selected');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }
}

/**
 * Rellena el selector con los streams presentes en las grabaciones.
 */
function updateStreamFilter() {
    let streams = [...new Set(allRecordings.map(recording => recording.stream))].sort();

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
        let filtered = allRecordings.filter(recording => recording.stream === selectedStream);
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

    recordings.forEach(recording => {
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




// VELOCIDAD Y TIEMPO
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

video.addEventListener('error', e => {
    console.error('Error al cargar el video:', e);
    let error = video.error;
    let errorMessage = 'Error desconocido al cargar el video';

    if (error) {
        switch (error.code) {
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

timelineSlider.addEventListener('input', () => {
    startOffsetInput.value = timelineSlider.value;
});

startOffsetInput.addEventListener('input', () => {
    let value = parseFloat(startOffsetInput.value) || 0;
    timelineSlider.value = value;
});

window.addEventListener('load', () => {
    console.log('MediaMTX Playback Player cargado');
    updateTimeDisplay();
    loadRecordings();
});