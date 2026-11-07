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
docker compose down                        # ¡no uses -v: borra las grabaciones y las marcas!

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
- **`.env`** (plantilla documentada en `.env.example`; el `.env` no se sube a git): todo lo que depende del equipo.
  - `WEBRTC_HOSTS` es opcional (por defecto `127.0.0.1`). WebRTC se limita a nuestras páginas: añaden a la respuesta WHIP/WHEP un candidato ICE con la IP con la que se abrieron (`anadirCandidatoDelServidor` en `js/utils/utils.js`) y funcionan en cualquier red sin configurar nada. Solo haría falta para clientes WebRTC externos (WHIP de OBS, ffmpeg…), que no se soportan; para meter señal desde fuera, RTMP o RTSP.
  - Las páginas pasan a `construirBaseUrlWebRTC` el `location.hostname` (sin puerto): con `PUERTO_HTTPS` distinto de 443, WebRTC sigue yendo a MediaMTX (:8889).
  - El resto (`PUERTO_HTTPS`, `PUERTO_HTTP`, `HTTP_REDIRECT`, `RETENCION_GRABACIONES`, `NIVEL_LOG_MEDIAMTX`, `NODE_ENV`) tiene valor por defecto.
  - **Regla:** nada que dependa del equipo se escribe en `mediamtx.yml` ni en `docker-compose.yml`. MediaMTX lo recibe como `MTX_<PARÁMETRO>` (p. ej. `MTX_WEBRTCADDITIONALHOSTS`), que sobrescribe su yml.
  - El compose pasa a cada servicio solo sus variables, con `${VAR:-por_defecto}` y sin `env_file`.
  - Tras cambiar el `.env`: `docker compose up -d` (`restart` no lo relee). `docker compose config` muestra los valores resueltos.

## Arquitectura

```
Broadcaster (WHIP) ─► MediaMTX :8889 (WebRTC) ─► player / neoplayer (WHEP)
                                │
                                ├─► graba fMP4 en el volumen recordings_volume (/recordings)
                                └─► Playback :9996 · Control API :9997
Navegador ─HTTPS :443─► Node/Express (server/modules/app.js)
                         ├─ /api/mediamtx/*  ─proxy─► MediaMTX :9997 (API v3; bufferiza y re-parsea JSON)
                         ├─ /api/playback/*  ─proxy─► MediaMTX :9996 (stream con pipe; lleva vídeo)
                         ├─ /api/replay/*    control de repeticiones para OBS (estado en memoria + SSE)
                         └─ /api/marcados/*  momentos marcados compartidos (datos_volume:/datos/marcados.json + SSE)
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

**CSS.**
- **Valores:** solo en `css/tokens.css`, que tiene dos niveles: paleta base (`--gris-900`, `--rojo-500`…) y tokens de uso (`--fondo`, `--texto`, `--programa`, `--alto-control`, `--borde`…). Las demás hojas solo usan `var(--…)` de uso, nunca la paleta base. `check-dom.mjs` falla si aparece un color literal fuera de `tokens.css`, un `!important` sin `/* permitido */` o un `.style.x` en JS (solo se permite `style.setProperty('--…')`).
- **Cascada:** capas `@layer reset, base, componentes, paginas, utilidades`.
  - `base.css` define reset, base, componentes y utilidades.
  - Cada hoja de página va entera en `@layer paginas { … }`.
  - No hay estilos sin capa: ganarían a todo.
- **`[hidden]`** está en la capa `utilidades`, así que siempre gana a los `display` de las clases. Usa `hidden` para mostrar y ocultar, no `style.display`.
- **Breakpoints:** solo 600, 900 y 1280 px. Lo que pueda acabar en un hueco estrecho (escenario de repeticiones en un dock de OBS, lista de directo, secciones de stats, configuración de la API) usa *container queries*.
- **Nombres:** BEM en castellano, `bloque__elemento` y `bloque--modificador`. Los estados de la píldora son `estado--inactivo`, `--conectando`, `--directo`, `--recibiendo`, `--ok`, `--aviso` y `--error`. Otros modificadores: `mensaje-linea--error`/`--ok` y `vacio--error`. Los estados de interacción van como clase suelta (`activo`, `ocupado`, `visible`).
- **Temas:** oscuro por defecto y claro automático (`prefers-color-scheme`), redefiniendo solo los tokens de uso. Las salidas de OBS llevan `<html class="salida-obs">` y siempre son oscuras.
- Usa propiedades lógicas (`margin-inline`, `padding-block`, `inset-inline-start`…). Los títulos son fluidos (`--t-titulo`).
- **Páginas "de aplicación"** (repeticiones, emitir): son `.pagina--app`, a altura fija de pantalla, a todo el ancho y sin scroll de página. El vídeo usa `.monitor--llenar`, que crece hasta el hueco disponible, y lo que no cabe va en `.columna-scroll`.
  - En móvil (< 900 px) y en ventanas de menos de 600 px de alto vuelven al scroll normal, con el monitor en 16:9.
  - En Emitir, el monitor y los botones quedan *sticky* bajo el tally.
- **Cámaras:** cada una tiene un color fijo que asigna `js/utils/camaras.js` (azul, naranja, cian, magenta y violeta, en ese orden). Hay una paleta por tema (`--cam-oscuro-*`, `--cam-claro-*`), validadas con el validador de la skill dataviz. Si cambias alguna, vuelve a validarla.
- Las URLs de `/api/playback/get` empiezan en el `start` pedido (su t=0). No hagas `currentTime = offset` encima. El fin de un tramo se calcula en `ended`: `video.duration` crece mientras llega el fMP4.
  - Para empezar justo al inicio de una toma usa su `startISO` (microsegundos): un `Date` redondea a milisegundos, cae antes de la grabación y MediaMTX da 404 (`urlPlayback` en `js/utils/grabaciones.js`).
- `/api/playback/list` ya une los segmentos de 10 min: cada elemento es una toma. Para borrar hay que ir segmento a segmento (`/v3/recordings/get` y `deletesegment`).
- Código compartido entre Repeticiones y Archivo: `js/utils/grabaciones.js` (consulta y URLs) y `js/utils/salida-obs.js` (enviar, quitar, SSE y tally de la salida) y `js/utils/marcados.js` (cliente de `/api/marcados`; las marcas se comparten entre equipos por SSE y Archivo también marca). Miniaturas en el navegador con caché en IndexedDB: `js/utils/miniaturas.js`.
- Todas las páginas de operador llevan el reloj de la cabecera (`<time id="reloj">` + `js/ui/reloj.js`): usa la hora del servidor si el equipo va desfasado más de 1,5 s, para que cuadre con las horas de las grabaciones.
- En Emitir, los ajustes **objetivo** (resolución, fps y bitrate de vídeo: los pide la app, pero deciden la cámara, la CPU y la red) llevan la etiqueta `.objetivo` y debajo el valor real (`.campo__real`, en `--texto-aviso` si no coincide y diciendo quién lo impide). Los ajustes fijos no llevan marca.
- En Emitir, emitiendo, los cambios de captura no cortan la conexión (`js/broadcaster-captura.js`: `replaceTrack` y `applyConstraints`). Otra cámara va antes al **previo** (verde) y sale con "Pasar a directo"; el monitor grande es el **programa** (rojo). Solo el códec, el nombre y pasar de "Sin micrófono" a un micro piden "Volver a emitir".
- El rojo y el verde se reservan para el estado tally: en directo / recibiendo.
- Para avisos y confirmaciones usa `js/ui/avisos.js` (`mostrarAviso`, `confirmar`) en lugar de `alert` y `confirm`.

**Salidas para OBS** (`neoplayer.html` y `display.html`):
- Solo vídeo sobre negro: nada se superpone en directo.
- Los avisos de depuración aparecen únicamente fuera de OBS (`!window.obsstudio`) o con `?debug=1`.

**Páginas:**
- `index` (directo y accesos).
- `broadcaster` (WHIP).
- `player` (WHEP).
- `neoplayer?stream=` (salida OBS).
- `playback` (repeticiones y control de OBS).
- `archivo` (tomas grabadas con miniatura: filtrar, ver, enviar a OBS desde un instante, descargar MP4 y borrar).
- `display` (salida OBS de repeticiones).
- `stats` (Chart.js servido desde `/vendor`).
- `api` (panel de la API v3).

## Convenciones

- El código, los comentarios, los identificadores y los mensajes de commit van en **español**.
- Formato de commit: `tipo(ámbito): descripción`, por ejemplo `feat(playback): ...` o `fix(broadcaster): ...`.
- `docs/` contiene material del TFG (emisores FFmpeg, RPi, PYWHIP, diagramas y documentos). No forma parte del stack.
