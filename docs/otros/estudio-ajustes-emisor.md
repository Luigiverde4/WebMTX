# Estudio de los ajustes del emisor (Emitir)

Qué hace de verdad cada ajuste de `broadcaster.html`, cuáles se aplican sin cortar la emisión y cuáles se han quitado por no tener efecto o por dar problemas.

Medido el 7-11-2026 con Chrome 156 (Windows 11) contra MediaMTX v1.21.3 en local.

## Método

- **Fuente de vídeo sintética** generada en un Worker, porque los temporizadores de la página se frenan:
  - 1920×1080 a 30 fps.
  - Panorámica sobre una textura, 60 objetos en movimiento y ruido de sensor.
  - Pide unos 4 Mbps en H264.
- **Fuente de audio sintética:** ruido blanco, solo en el canal izquierdo.
- **Publicación** por WHIP a MediaMTX y lectura por WHEP desde la misma página.
- **Medida** de `getStats()` cada segundo:
  - kbps reales (a partir de `bytesSent`).
  - `frameWidth`/`frameHeight`, `framesPerSecond`, `targetBitrate` y `qualityLimitationReason`.
- **Grabación:** se comprueba en el registro de MediaMTX y en el volumen de grabaciones.
- **Captura (resolución, fps):** no se ha podido medir porque no había ninguna cámara física activa. Se apoya en la especificación de `getUserMedia`.

## Resultado por ajuste

### Captura: se aplican al volver a emitir

| Ajuste | ¿Tiene efecto? | Notas |
|---|---|---|
| Cámara, micrófono | Sí | Abren otro dispositivo. |
| Resolución, fps | Sí (según especificación) | Se pide la resolución exacta y, si la cámara no la da, la más cercana. Las opciones que la cámara no admite se deshabilitan (`getCapabilities`). |
| Códec | Sí | H264, VP9, AV1 y H265 se publican, se ven por WHEP y se graban. **VP8 no se graba**: MediaMTX descarta su vídeo (`[recorder] skipping track 1 (VP8)`) y la carpeta solo tenía audio (88 KB, frente a 2,6–6,7 MB de los demás). |
| Procesado del micrófono | Sí | `getSettings()` refleja eco, ruido y ganancia tal como se piden. |

### Calidad del envío: se aplica al momento (`RTCRtpSender.setParameters`)

| Ajuste | ¿Tiene efecto? | Medida |
|---|---|---|
| Bitrate máximo de vídeo | Sí, como techo | Tope 1 Mbps: 987 kbps reales. Topes 3, 6 y 15 Mbps: 1,7, 2,6 y 4,3 Mbps, porque la escena no pedía más. Al bajarlo actúa en 1–2 s. Al subirlo, el objetivo del control de congestión sube poco a poco (2,8 → 5,7 Mbps en unos 9 s). |
| Si falta red o CPU (`degradationPreference`) | Sí, **sin `contentHint`** | Con tope de 0,8 Mbps a 1080p: mantener fotogramas, 480×270 a 27 fps; mantener resolución, 1920×1080 a 10 fps; equilibrar, 640×360 a 13 fps. |
| Resolución enviada (`scaleResolutionDownBy`) | Sí | Mitad: 960×540. Un cuarto: 480×270. Al momento. |
| Bitrate de audio | Sí | Topes 16, 64, 128 y 256 kbps: 12, 63, 128 y 256 kbps reales. Sin tope, Chrome usa unos 30 kbps. |

## Lo que se ha quitado y por qué

- **Prioridad del encoder (`contentHint`).**
  - **Con "Nitidez (detalle)"**, que era el valor por defecto, Chrome trata la cámara como una captura de pantalla y no baja nunca la resolución. "Si falta red o CPU" quedaba anulado: las tres opciones daban 1080p a 10 fps.
  - **Con "Fluidez (movimiento)"** tampoco aporta nada: según la especificación, una `degradationPreference` explícita manda sobre el hint, y la app siempre la fija.
  - **"Texto"** solo activa herramientas de texto en AV1.
- **Códec "Automático".** Chrome elige VP8 por defecto, así que "Automático" significaba quedarse sin repeticiones.
- **VP8.** MediaMTX no lo graba en fMP4.
- **Bitrate de audio de 192 y 256 kbps.** El audio sale en mono porque MediaMTX no pone `stereo=1` en su respuesta SDP. Se ha comprobado mandando ruido solo por la izquierda: llega igual por los dos canales. Más de 128 kbps en mono no aporta nada.
- **`channelCount: 2`** en las restricciones del micrófono, por el mismo motivo.

## Posibles mejoras (no aplicadas)

- **Resolución y fps en directo.** Se podrían cambiar sin volver a emitir con `track.applyConstraints()`: reconfigura la cámara sin renegociar. Bajar fps ya funciona en directo con `maxFramerate` (medido: 15 fps). Hay que probarlo con una cámara real.
- **Audio estéreo.** Exige añadir `stereo=1` al SDP del emisor y de todos los lectores (player, neoplayer y la fuente de navegador de OBS). Solo tiene sentido con un micrófono estéreo y sin cancelación de eco, que fuerza mono.

## Fuentes

- W3C, [MediaStreamTrack Content Hints](https://www.w3.org/TR/mst-content-hint/): relación entre hint y `degradationPreference` (§4.3).
- [Intent to Implement and Ship: RTCRtpSendParameters.degradationPreference](https://groups.google.com/a/chromium.org/g/blink-dev/c/WPvxi5nUK2E/m/Xd0ZzPwxAwAJ) (Chromium).
- MediaMTX, [Record streams to disk](https://mediamtx.org/docs/features/record): códecs que se graban en fMP4.
- MediaMTX, [WebRTC-specific features](https://mediamtx.org/docs/features/webrtc-specific-features): H265 en navegadores.
- WebRTC, [audio_encoder_opus.cc](https://chromium.googlesource.com/external/webrtc/+/master/modules/audio_coding/codecs/opus/audio_encoder_opus.cc): los canales salen del parámetro `stereo` del SDP.
