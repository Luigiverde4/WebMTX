# Checklist funcional del front

Inventario de lo que hace cada página. Sirve como prueba de regresión del rediseño: cada punto se comprueba en Chrome contra el stack real (`docker compose up -d`) con streams de prueba:

```powershell
ffmpeg -re -f lavfi -i "testsrc=size=1280x720:rate=30" -f lavfi -i "sine=frequency=440:sample_rate=48000" -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 -pix_fmt yuv420p -c:a libopus -ac 2 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam1
ffmpeg -re -f lavfi -i "smptehdbars=size=1280x720:rate=30" -f lavfi -i "sine=frequency=880:sample_rate=48000" -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -bf 0 -g 30 -pix_fmt yuv420p -c:a libopus -ac 2 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam2
```

Puertas automáticas: `node scripts/check-dom.mjs` y `pwsh scripts/smoke.ps1 -RequiereReplay -CompruebaRedireccion`.

Estado a 2026-11-06 (rama rediseno-front): verificado en Chrome contra el stack real con streams sintéticos; el broadcaster, con una cámara sintética inyectada en getUserMedia (sin permiso de webcam). Sin marcar = pendiente de probar.

Leyenda: **[L]** = funcionalidad que ya existía en local · **[R]** = portada del repo POLIWOOD-UPV/MediaServer · **[N]** = nueva en el rediseño.

## Común a todos los paneles

- [x] [N] Cabecera con navegación a Inicio, Emitir, Ver, Repeticiones, Estadísticas y API; la página actual marcada.
- [x] [N] Sin scroll horizontal a 360 px; foco visible con teclado; sin errores en consola.
- [x] [N] Avisos y confirmaciones dentro de la página (sin `alert`/`confirm` del navegador).

## Inicio (`index.html`)

- [x] [L] Enlaces a todas las herramientas.
- [x] [N] Lista de streams en directo (se actualiza sola) con acciones Ver, Repetir y copiar URL de OBS.
- [x] [N] Enlaces y URLs de las salidas OBS: `neoplayer.html?stream=…` y `display.html`.

## Emitir (`broadcaster.html`)

- [x] [L] Servidor autodetectado desde la URL de la página.
- [x] [L] Endpoint recordado entre visitas (localStorage).
- [x] [L] Endpoints rápidos cam1, cam2, movil, extra rellenan el campo.
- [x] [L] Lista de paths ocupados con botón de refresco.
- [x] [R] Endpoints rápidos ocupados marcados.
- [x] [R] Nombre de endpoint saneado al escribir (sin acentos ni espacios, minúsculas).
- [x] [L] Si el endpoint ya está en uso pide confirmación antes de reemplazar al emisor.
- [x] [L] Selector de cámara y micrófono (incluye "sin micrófono").
- [ ] [L] Lista de dispositivos se refresca al conectar/desconectar y con el botón. *(sin probar: requiere conectar una cámara física)*
- [x] [L] Resolución seleccionable.
- [x] [L] Códec de vídeo seleccionable según el navegador, recordado.
- [x] [N] H264 y 1080p por defecto; aviso si el códec no es H264.
- [x] [R] Bitrate de vídeo (1–20 Mbps) recordado y aplicable en directo sin cortar.
- [x] [N] Fps, contentHint, preferencia de degradación, procesado de audio y bitrate de audio. *(limitar fps/resolución a las capacidades de la cámara: sin probar con webcam real)*
- [x] [N] Bloque "aplicado realmente" con lo que entrega la cámara.
- [x] [L] Previsualizar (botón y clic en el vídeo) y cambiar de cámara actualiza la preview.
- [x] [L] Iniciar y detener emisión; indicador de directo.
- [x] [R] Detener durante la conexión cancela el intento.
- [x] [L] Tabla de códecs y bytes enviados (refresco cada 500 ms).
- [ ] [L] Watchdog: si no salen bytes, avisa y corta. *(lógica sin cambios salvo umbral 3 s y aviso en página; no se forzó un corte)*
- [x] [L] Al detener se elimina la sesión WHIP en MediaMTX.

## Ver (`player.html`)

- [x] [L] Servidor autodetectado; stream recordado.
- [x] [L] Botones de los paths en directo; un clic reproduce.
- [x] [R] La lista de paths se actualiza sola cada 4 s; el que se reproduce está resaltado.
- [x] [L] Reproducir / detener con estado visible.
- [x] [R] Reconexión automática si cae la conexión; margen de gracia para `disconnected`.
- [x] [L] Watchdog de bytes recibidos (ahora dispara la reconexión). *(reconexión verificada reiniciando MediaMTX; el disparo por watchdog no se forzó aislado)*
- [x] [N] Al detener se elimina la sesión WHEP en MediaMTX.

## Neoplayer (`neoplayer.html`, salida OBS)

- [x] [R] `?stream=cam1` reproduce a pantalla completa con audio y reconexión.
- [x] [N] Sin `?stream=` muestra un selector en lugar de reintentar sin fin.
- [ ] [N] Nada se superpone al vídeo dentro de OBS. *(verificado fuera de OBS y por CSS; falta probarlo en OBS real)*

## Repeticiones (`playback.html`)

- [x] [L] Lista de grabaciones cargada automáticamente con contador.
- [x] [L] Filtro/selección por stream y por grabación.
- [x] [R] Lista siempre al día (sondeo) sin perder la selección.
- [x] [R] Preferencias recordadas (stream, grabación, modo, valores).
- [x] [L] Modo "desde el inicio + offset".
- [x] [L][R] Modo "últimos N segundos" (contra el reloj) con slider y atajos 15/30/60 s.
- [x] [L] Modo "hora específica" (HH:MM o HH:MM:SS).
- [x] [R] Línea temporal logarítmica con burbuja de hora; arrastrar rellena el modo activo.
- [x] [R] La repetición no se detiene al alcanzar el directo (encadena tramos).
- [x] [L] Velocidad 0.25–4x y visor de velocidad/tiempo.
- [x] [L] Mensajes de error del vídeo (pista H264).
- [x] [R] Marcar momentos, reproducirlos, anotarlos, borrarlos, enviarlos a OBS.
- [x] [R] Enviar a OBS / quitar de OBS con estado visible.

## Display (`display.html`, salida OBS)

- [x] [R] Espera repetición; al enviar desde playback empieza a reproducir (SSE).
- [x] [R] Encadena tramos al llegar al directo; quitar vuelve a esperar.
- [x] [R] Autoplay con sonido; si se bloquea, reintenta en silencio (aviso solo fuera de OBS). *(probado en Chrome; dentro de OBS sin probar)*

## Estadísticas (`stats.html`)

- [x] [L] Refresco manual y automático; intervalo configurable y recordado.
- [x] [L] 6 indicadores: paths, ready, online, readers, bytes recibidos y enviados.
- [x] [L] Gráficas: throughput total, throughput por stream, readers por path.
- [x] [L] Sección por stream con estado, readers, rx/tx, origen, tracks y gráfica con mín/media/máx.
- [x] [N] Sin Chart.js se avisa y las secciones se pintan igualmente.

## API (`api.html`)

- [x] [L] Secciones plegables con carga bajo demanda; "Actualizar todo".
- [x] [L] Acciones rápidas: recargar config, cerrar path, expulsar sesión RTSP/WebRTC, borrar segmento.
- [x] [L] Paths: listar, crear/actualizar (publisher/rtsp/rtmp/http + grabar), editar, cerrar.
- [x] [L] Config global: ver y modificar (PATCH).
- [x] [L] Sesiones RTSP/WebRTC con expulsión; muxers HLS.
- [x] [L] Grabaciones por path con borrado de segmentos.
- [x] [N] Estado real de la API en la cabecera.
