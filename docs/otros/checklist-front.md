# Checklist funcional del front

Inventario de lo que hace cada página. Sirve como prueba de regresión del rediseño: cada punto se comprueba en Chrome contra el stack real (`docker compose up -d`) con streams de prueba:

```powershell
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 -pix_fmt yuv420p -c:a libopus -ac 2 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam1
ffmpeg -re -f lavfi -i "smptehdbars=size=1280x720:rate=30" -f lavfi -i "sine=frequency=880:sample_rate=48000" -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 -pix_fmt yuv420p -c:a libopus -ac 2 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam2
```

Puertas automáticas: `node scripts/check-dom.mjs` y `pwsh scripts/smoke.ps1 -RequiereReplay -CompruebaRedireccion`.

Leyenda: **[L]** = funcionalidad que ya existía en local · **[R]** = portada del repo POLIWOOD-UPV/MediaServer · **[N]** = nueva en el rediseño.

## Común a todos los paneles

- [ ] [N] Cabecera con navegación a Inicio, Emitir, Ver, Repeticiones, Estadísticas y API; la página actual marcada.
- [ ] [N] Sin scroll horizontal a 360 px; foco visible con teclado; sin errores en consola.
- [ ] [N] Avisos y confirmaciones dentro de la página (sin `alert`/`confirm` del navegador).

## Inicio (`index.html`)

- [ ] [L] Enlaces a todas las herramientas.
- [ ] [N] Lista de streams en directo (se actualiza sola) con acciones Ver, Repetir y copiar URL de OBS.
- [ ] [N] Enlaces y URLs de las salidas OBS: `neoplayer.html?stream=…` y `display.html`.

## Emitir (`broadcaster.html`)

- [ ] [L] Servidor autodetectado desde la URL de la página.
- [ ] [L] Endpoint recordado entre visitas (localStorage).
- [ ] [L] Endpoints rápidos cam1, cam2, movil, extra rellenan el campo.
- [ ] [L] Lista de paths ocupados con botón de refresco.
- [ ] [R] Endpoints rápidos ocupados marcados.
- [ ] [R] Nombre de endpoint saneado al escribir (sin acentos ni espacios, minúsculas).
- [ ] [L] Si el endpoint ya está en uso pide confirmación antes de reemplazar al emisor.
- [ ] [L] Selector de cámara y micrófono (incluye "sin micrófono").
- [ ] [L] Lista de dispositivos se refresca al conectar/desconectar y con el botón.
- [ ] [L] Resolución seleccionable.
- [ ] [L] Códec de vídeo seleccionable según el navegador, recordado.
- [ ] [N] H264 y 1080p por defecto; aviso si el códec no es H264.
- [ ] [R] Bitrate de vídeo (1–20 Mbps) recordado y aplicable en directo sin cortar.
- [ ] [N] Fps, contentHint, preferencia de degradación, procesado de audio y bitrate de audio.
- [ ] [N] Bloque "aplicado realmente" con lo que entrega la cámara.
- [ ] [L] Previsualizar (botón y clic en el vídeo) y cambiar de cámara actualiza la preview.
- [ ] [L] Iniciar y detener emisión; indicador de directo.
- [ ] [R] Detener durante la conexión cancela el intento.
- [ ] [L] Tabla de códecs y bytes enviados (refresco cada 500 ms).
- [ ] [L] Watchdog: si no salen bytes, avisa y corta.
- [ ] [L] Al detener se elimina la sesión WHIP en MediaMTX.

## Ver (`player.html`)

- [ ] [L] Servidor autodetectado; stream recordado.
- [ ] [L] Botones de los paths en directo; un clic reproduce.
- [ ] [R] La lista de paths se actualiza sola cada 4 s; el que se reproduce está resaltado.
- [ ] [L] Reproducir / detener con estado visible.
- [ ] [R] Reconexión automática si cae la conexión; margen de gracia para `disconnected`.
- [ ] [L] Watchdog de bytes recibidos (ahora dispara la reconexión).
- [ ] [N] Al detener se elimina la sesión WHEP en MediaMTX.

## Neoplayer (`neoplayer.html`, salida OBS)

- [ ] [R] `?stream=cam1` reproduce a pantalla completa con audio y reconexión.
- [ ] [N] Sin `?stream=` muestra un selector en lugar de reintentar sin fin.
- [ ] [N] Nada se superpone al vídeo dentro de OBS.

## Repeticiones (`playback.html`)

- [ ] [L] Lista de grabaciones cargada automáticamente con contador.
- [ ] [L] Filtro/selección por stream y por grabación.
- [ ] [R] Lista siempre al día (sondeo) sin perder la selección.
- [ ] [R] Preferencias recordadas (stream, grabación, modo, valores).
- [ ] [L] Modo "desde el inicio + offset".
- [ ] [L][R] Modo "últimos N segundos" (contra el reloj) con slider y atajos 15/30/60 s.
- [ ] [L] Modo "hora específica" (HH:MM o HH:MM:SS).
- [ ] [R] Línea temporal logarítmica con burbuja de hora; arrastrar rellena el modo activo.
- [ ] [R] La repetición no se detiene al alcanzar el directo (encadena tramos).
- [ ] [L] Velocidad 0.25–4x y visor de velocidad/tiempo.
- [ ] [L] Mensajes de error del vídeo (pista H264).
- [ ] [R] Marcar momentos, reproducirlos, anotarlos, borrarlos, enviarlos a OBS.
- [ ] [R] Enviar a OBS / quitar de OBS con estado visible.

## Display (`display.html`, salida OBS)

- [ ] [R] Espera repetición; al enviar desde playback empieza a reproducir (SSE).
- [ ] [R] Encadena tramos al llegar al directo; quitar vuelve a esperar.
- [ ] [R] Autoplay con sonido; si se bloquea, reintenta en silencio (aviso solo fuera de OBS).

## Estadísticas (`stats.html`)

- [ ] [L] Refresco manual y automático; intervalo configurable y recordado.
- [ ] [L] 6 indicadores: paths, ready, online, readers, bytes recibidos y enviados.
- [ ] [L] Gráficas: throughput total, throughput por stream, readers por path.
- [ ] [L] Sección por stream con estado, readers, rx/tx, origen, tracks y gráfica con mín/media/máx.
- [ ] [N] Sin Chart.js se avisa y las secciones se pintan igualmente.

## API (`api.html`)

- [ ] [L] Secciones plegables con carga bajo demanda; "Actualizar todo".
- [ ] [L] Acciones rápidas: recargar config, cerrar path, expulsar sesión RTSP/WebRTC, borrar segmento.
- [ ] [L] Paths: listar, crear/actualizar (publisher/rtsp/rtmp/http + grabar), editar, cerrar.
- [ ] [L] Config global: ver y modificar (PATCH).
- [ ] [L] Sesiones RTSP/WebRTC con expulsión; muxers HLS.
- [ ] [L] Grabaciones por path con borrado de segmentos.
- [ ] [N] Estado real de la API en la cabecera.
