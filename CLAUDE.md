# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repositorio.

## Qué es

Sistema genérico de streaming de baja latencia (TFG). Un servidor **Node.js/Express** fino delante de **MediaMTX**:

- El navegador hace todo el WebRTC (WHIP para emitir, WHEP para ver).
- Node sirve los estáticos y hace de proxy de las dos APIs HTTPS de MediaMTX, para evitar problemas de CORS y de certificados autofirmados. Además gestiona el control de repeticiones para OBS (SSE).
- MediaMTX se encarga de la ingesta, el reenvío y la grabación.

**No hay build ni bundler.** El front son `<script>` clásicos y el backend es una sola app Express.

## Comandos

```powershell
.\scripts\gen-certs.ps1 -IPsLocales        # primera vez: server\cert.pem + key.pem (mkcert)
docker compose up --build -d               # levanta 'server' (Node) y 'mediamtx' (contenedor mediamtxTFG)
docker compose logs -f server              # o: -f mediamtx  (también en mediamtx\logs\mediamtx.log)
docker compose down                        # ¡no uses -v: borra el volumen de grabaciones!

node scripts/check-dom.mjs                 # contratos HTML<->JS del front + node --check
pwsh scripts/smoke.ps1 -RequiereReplay -CompruebaRedireccion   # prueba de humo contra el stack
pwsh scripts/streams-prueba.ps1            # publica cam1/cam2 sintéticos con ffmpeg (se relanzan solos)
.\scripts\exportar-grabaciones.ps1 -Path cam1   # copia grabaciones del volumen Docker a disco
.\scripts\whep-view.ps1 -Cam cam1          # visor WHEP con GStreamer (pruebas desde otro PC)
```

- **Cambios del front:** no hace falta reconstruir. `./server` está montado con bind en el contenedor, así que basta con recargar el navegador.
- **Cambios en `server/*.js` o `server/modules/*.js`:** `docker compose restart server`.
- **Cambios en las dependencias de `package.json`:** `docker compose down`, después `docker volume rm webmtx_node_modules_volume` y después `docker compose up --build -d`. El volumen de `node_modules` no se actualiza solo.

## Configuración local necesaria

- **`server/cert.pem` y `server/key.pem`:** los generas con `scripts/gen-certs.ps1`. Están en `.gitignore`.
  - Los cargan Node y MediaMTX; este último los monta como `/server.crt` y `/server.key`.
  - Sin ellos Node no arranca (sale con un mensaje de error). Además el navegador no concede cámara ni micrófono fuera de HTTPS, salvo en localhost.
- **`mediamtx.yml` → `webrtcAdditionalHosts`:** es un array con las IPs LAN desde las que se usa el sistema, una por red habitual. Si cambias de red, añade la IP nueva al array.
- **`HTTP_REDIRECT`:** por defecto `true`, y el puerto 80 redirige a HTTPS. Ponlo a `false` (con un `.env` o en el entorno) y comenta el puerto 80 en `docker-compose.yml` si otro servicio necesita ese puerto.

## Arquitectura

```
Broadcaster (WHIP) ─► MediaMTX :8889 (WebRTC) ─► player / neoplayer (WHEP)
                                │
                                ├─► graba fMP4 en el volumen recordings_volume (/recordings)
                                └─► Playback :9996 · Control API :9997
Navegador ─HTTPS :443─► Node/Express (server/modules/app.js)
                         ├─ /api/mediamtx/*  ─proxy─► MediaMTX :9997 (API v3; bufferiza y re-parsea JSON)
                         ├─ /api/playback/*  ─proxy─► MediaMTX :9996 (stream con pipe; lleva vídeo)
                         └─ /api/replay/*    control de repeticiones para OBS (estado en memoria + SSE)
```

**Puertos.** 9996 no se publica al host: solo se llega a través del proxy. El 80 solo redirige.

**Grabación** (`pathDefaults` en `mediamtx.yml`):
- Todos los paths se graban por defecto, en fMP4 con segmentos de 10 minutos y retención de 7 días.
- `all_others` hereda de `pathDefaults`, que es la única fuente de verdad.
- Para no grabar un path, se declara aparte con `record: no`.

## Front (`server/public`): reglas

**Scripts globales, sin módulos.**
- Todos los scripts de una página comparten el ámbito global y el orden de las etiquetas `<script>` es el grafo de dependencias.
- Nunca repitas un `let` o `const` de nivel superior entre scripts de la misma página: da `SyntaxError`. `check-dom.mjs` lo detecta.

**Capas:**
- `js/utils/*`: helpers puros.
- `js/ui/*`: referencias al DOM y renderizado.
- `js/<pagina>.js`: lógica WebRTC o de negocio.
- `js/api/api.js`: `GET`/`POST`/`PATCH`/`DELETE` contra `/api/mediamtx/v3`.

**Nombres de funciones.** Las que se llaman desde `onclick`, `onchange` o `data-load` son contrato: si cambias un nombre, actualiza el HTML.

**Sistema de diseño.** Está en `css/base.css`: tokens en `:root`, componentes y la barra de tally.
- Cada cámara tiene un color fijo que asigna `js/utils/camaras.js` (azul, naranja, cian, magenta y violeta, en ese orden). La paleta está validada con el validador de la skill dataviz contra el fondo oscuro; si la cambias, vuelve a validarla.
- `[hidden]` siempre gana a los `display` de las clases (regla global en base.css): usa `hidden` para mostrar y ocultar, no `style.display`.
- Las URLs de `/api/playback/get` empiezan en el `start` pedido (su t=0). No hagas `currentTime = offset` encima. El fin de un tramo se calcula en `ended`: `video.duration` crece mientras llega el fMP4.
- El rojo y el verde se reservan para el estado tally: en antena / recibiendo.
- Para avisos y confirmaciones usa `js/ui/avisos.js` (`mostrarAviso`, `confirmar`) en lugar de `alert` y `confirm`.

**Salidas para OBS** (`neoplayer.html` y `display.html`):
- Solo vídeo sobre negro: nada se superpone en antena.
- Los avisos de depuración aparecen únicamente fuera de OBS (`!window.obsstudio`) o con `?debug=1`.

**Páginas:**
- `index` (directo y accesos).
- `broadcaster` (WHIP).
- `player` (WHEP).
- `neoplayer?stream=` (salida OBS).
- `playback` (repeticiones y control de OBS).
- `display` (salida OBS de repeticiones).
- `stats` (Chart.js servido desde `/vendor`).
- `api` (panel de la API v3).

## Convenciones

- El código, los comentarios, los identificadores y los mensajes de commit van en **español**.
- Formato de commit: `tipo(ámbito): descripción`, por ejemplo `feat(playback): ...` o `fix(broadcaster): ...`.
- `docs/` contiene material del TFG (emisores FFmpeg, RPi, PYWHIP, diagramas y documentos). No forma parte del stack.
