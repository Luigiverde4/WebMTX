# TFG - Streaming WebRTC de Baja Latencia

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

Sistema de streaming de vídeo en tiempo real con latencia ultra-baja (~100-300ms) utilizando WebRTC, FFmpeg y MediaMTX.

> **Trabajo Fin de Grado - Universidad Politécnica de Valencia**  
> Diseño e implementación de un sistema de distribución de video de baja latencia basado en WebRTC y MediaMTX para realización en directo.

## Descripción

Este proyecto implementa un sistema completo de transmisión de vídeo con baja latencia utilizando el protocolo WebRTC. Permite capturar vídeo desde diferentes fuentes (cámaras USB, webcams, capturadoras, pantalla) y transmitirlo a través de un servidor web con visualización en tiempo real.

### Características principales

- **Ultra baja latencia**: ~100-300ms gracias a WebRTC
- **Multi-protocolo**: Soporte para WHIP/WHEP, RTSP, RTMP, HLS y SRT
- **Multiplataforma**: Scripts para Windows, Mac, Android, Linux y Raspberry Pi
- **Interfaz web de sala de realización** (HTML/CSS/JS sin dependencias de build, responsive hasta móvil y dock de OBS):
  - Emitir (broadcaster WHIP desde el navegador, con códec, resolución, fps y bitrate configurables)
  - Ver (player WHEP con reconexión automática)
  - Repeticiones (repetición "hace N segundos", línea temporal, momentos marcados y envío a OBS)
  - Salidas para OBS: cámara a pantalla completa (`neoplayer.html`) y repeticiones (`display.html`)
  - Estadísticas en tiempo real y panel de la API de MediaMTX
- **Containerizado**: Despliegue sencillo con Docker Compose
- **API de control**: Gestión completa de streams mediante la API HTTP v3 de MediaMTX
- **Arquitectura modular**: Componentes JS organizados por funcionalidad

## Índice

- [Arquitectura](#arquitectura)
- [Flujo de datos](#flujo-de-datos)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Uso](#uso)
- [Grabaciones](#grabaciones)
- [Puertos y Protocolos](#puertos-y-protocolos)
- [Configuración con .env](#configuración-con-env)
- [API MediaMTX](#api-mediamtx)
- [Configuración avanzada](#configuración-avanzada)
- [Solución de problemas](#solución-de-problemas)
- [Desarrollo](#desarrollo)
- [Tecnologías](#tecnologías)
- [Licencia](#licencia)
- [Autor](#autor)

## Arquitectura

```
┌───────────────┐    ┌─────────────────┐                    ┌─────────────────────────────────────┐                    ┌─────────────────┐
│    FUENTES    │    │    EMISORES     │                    │              SERVIDOR               │                    │    CLIENTES     │
├───────────────┤    ├─────────────────┤                    ├─────────────────────────────────────┤                    ├─────────────────┤
│               │    │                 │       WHIP         │                                     │      WebRTC        │                 │
│               │───►│  FFmpeg (Win)   │ ─────────────────► │  ┌─────────────┐    ┌───────────┐   │ ◄───────────────►  │    Browser      │
│  Cámaras      │    │                 │                    │  │             │    │           │   │                    │                 │
│               │───►│  FFmpeg (RPi)   │ ─────────────────► │  │  MediaMTX   │◄───│  Node.js  │   │◄── HTTP redirect   │      OBS        │
│  Micros       │    │                 │                    │  │  (8889)     │    │  Server   │   │◄── https://:443    │                 │
│               │───►│  Python/PYWHIP  │ ─────────────────► │  │             │    │           │   │                    │     .html       │
│  Pantalla     │    │                 │                    │  │  API:9997 ◄─┼────│ /api/     │   │                    │                 │
│               │───►│  Broadcaster    │ ─────────────────► │  │     :9996   │    │ mediamtx  │   │                    │                 │
│     ...       │    │  (Browser WHIP) │                    │  └─────────────┘    └───────────┘   │                    │      VLC        │
└───────────────┘    └─────────────────┘                    └─────────────────────────────────────┘                    └─────────────────┘
```

> **Proxy API**: El servidor Node.js incluye un proxy en `/api/mediamtx/*` que redirige peticiones a la API REST de MediaMTX (puerto 9997), evitando problemas de CORS y exponiéndola por HTTPS.
>
> **Playback proxy**: El servidor Node.js incluye un proxy en `/api/playback/*` para reenviar peticiones al servicio de grabaciones/reproducción (puerto 9996) sin exponer ese backend al navegador, también por HTTPS.
>
> **HTTPS**: El servidor soporta HTTPS (puerto 443) con certificados mkcert, necesario para usar `getUserMedia()` desde cualquier dispositivo que acceda por IP (no localhost).

### Flujo de datos

1. **Captura (Fuentes)**: Cámaras, micrófonos, pantalla o capturadoras proporcionan el contenido multimedia
2. **Emisión (WHIP)**: FFmpeg, scripts Python o el Broadcaster web codifican el vídeo y lo envían al servidor MediaMTX mediante protocolo WHIP
3. **Servidor (MediaMTX)**: Recibe los streams y los redistribuye a los clientes conectados
4. **Reproducción (WHEP)**: Los navegadores se conectan mediante WebRTC para visualización en tiempo real
5. **Monitoreo**: Dashboard de estadísticas obtiene métricas en tiempo real via API REST
6. **Control**: la API v3 de MediaMTX permite gestionar configuración, paths, grabaciones y sesiones
7. **Repeticiones**: MediaMTX graba cada cámara en fMP4; la página de repeticiones las sirve por el proxy de playback y las envía a OBS (`display.html`) por SSE

## Requisitos

### Para el servidor (Docker)
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM mínimo
- Puertos disponibles: 443, 1935, 8554, 8888, 8889, 8189/UDP, 9997 y, si se usa la redirección, 80
- mkcert (certificados TLS locales)

### Para emisión desde Windows
- FFmpeg compilado con soporte WebRTC/WHIP (ver `/docs/compilacion_todo_junto.md`)
- Cámara USB o capturadora compatible

### Para emisión desde Raspberry Pi
- Raspberry Pi 4 (recomendado)
- FFmpeg compilado con soporte WebRTC/WHIP (ver `/docs/compilacion_ffmpeg_webrtc.md`)
- Cámara USB o módulo de cámara Pi

### Opcional
- Python 3.8+ (para scripts PYWHIP)
- Descargar el ffmpeg personalizado con openSSL y WHIP-  [(CLICK a wffmpeg)](https://1drv.ms/f/c/d02daa2df2a2a690/IgB3e318fCdvRr6S5Q1w_hRNAU3r8oo8cSc6gcB4LQObLE8?e=9UIHiV)
## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Luigiverde4/TFG.git
cd TFG
```


### 2. Descargar el wffmpeg (Windows)

Para emitir streams con WebRTC/WHIP desde Windows, necesitas una versión de FFmpeg compilada con soporte OpenSSL y WHIP:

**[⬇️ Descargar wffmpeg](https://1drv.ms/f/c/d02daa2df2a2a690/IgB3e318fCdvRr6S5Q1w_hRNAU3r8oo8cSc6gcB4LQObLE8?e=9UIHiV)**

Descomprime el archivo y añade la carpeta `bin` al PATH del sistema, o colócala en la raíz del proyecto.

> **Nota**: Si prefieres compilar FFmpeg tú mismo, consulta `/docs/compilacion_todo_junto.md`

### 3. Configurar este equipo (`.env`)

Todo lo que cambia de un equipo a otro (IPs, puertos, retención de grabaciones…) va en un fichero `.env` en la raíz, que **no se sube a git**. La plantilla documentada es `.env.example`:

```powershell
Copy-Item .env.example .env
notepad .env        # pon tu IP de la red local en IP_EQUIPO
```

`IP_EQUIPO` es **obligatoria**: es la IP de este equipo en la red local (una sola), que MediaMTX anuncia a los navegadores para la conexión WebRTC. Si cambias de red, cámbiala y aplica con `docker compose up -d`. Sin ella `docker compose` se niega a arrancar y lo dice. Para ver tus IPs: `Get-NetIPAddress -AddressFamily IPv4` (o `ipconfig`).

Ver la sección [Configuración con .env](#configuración-con-env) para el resto de variables.

### 4. Configurar HTTPS con mkcert

Para usar el **Broadcaster desde cualquier dispositivo externo** (otro PC, móvil, tablet), es necesario HTTPS. Los navegadores requieren un contexto seguro (HTTPS) para acceder a `getUserMedia()` (cámara/micrófono) cuando se accede por IP.

> **localhost funciona sin HTTPS**, pero cualquier acceso por IP (192.168.x.x, etc.) requiere HTTPS.

#### Instalar mkcert

```bash
# Windows (con Chocolatey)
choco install mkcert

# Windows (con Scoop)
scoop install mkcert

# macOS
brew install mkcert

# Linux (Debian/Ubuntu)
sudo apt install mkcert
```

#### Generar certificados

Desde la raíz del repositorio, en PowerShell:

```powershell
# Primera vez en este equipo: instala la CA local y genera server\cert.pem + key.pem
.\scripts\gen-certs.ps1 -Install -IPsLocales

# Regenerar añadiendo una IP concreta (sobrescribe los existentes)
.\scripts\gen-certs.ps1 -IP 192.168.1.46 -IPsLocales -Force
```

El script incluye siempre `localhost`, `127.0.0.1` y `::1`, la `IP_EQUIPO` del `.env` y, con `-IPsLocales`, las IPv4 actuales del equipo. Con `-SoloListar` muestra qué cubriría sin generar nada.

> **Nota**: los certificados deben estar en `server/` como `cert.pem` y `key.pem` (están en `.gitignore`). Sin ellos el servidor Node no arranca y lo indica en el log; MediaMTX tampoco, porque usa los mismos ficheros.
>
> En otros dispositivos (móvil, otro PC) hay que confiar en la CA de mkcert (`mkcert -CAROOT` indica dónde está `rootCA.pem`) o aceptar el aviso del navegador.

### 5. Levantar los servicios

```bash
docker compose up --build
```

Para ejecutar en segundo plano:
```bash
docker compose up -d --build
```

### 6. Verificar funcionamiento

Acceder a las interfaces web:

| Interfaz | URL | Descripción |
|----------|-----|-------------|
| **Inicio** | https://localhost/ | Cámaras en directo (con accesos a ver, repetir y URL para OBS) y herramientas |
| **Emitir** | https://localhost/broadcaster.html | Emitir cámara y micrófono desde el navegador (WHIP) |
| **Ver** | https://localhost/player.html | Monitor WebRTC (WHEP) con reconexión; `?stream=cam1` abre una cámara |
| **Repeticiones** | https://localhost/playback.html | Repeticiones de lo grabado, momentos marcados y control de la salida OBS |
| **Archivo** | https://localhost/archivo.html | Todas las tomas grabadas con miniatura, inicio y fin (o en directo): filtrar, ver, enviar a OBS, descargar en MP4 y borrar |
| **Estadísticas** | https://localhost/stats.html | Tráfico y espectadores de cada cámara en tiempo real |
| **API** | https://localhost/api.html | Paths, sesiones, configuración y grabaciones de MediaMTX (API v3) |
| **Salida de cámara (OBS)** | https://localhost/neoplayer.html?stream=cam1 | Solo vídeo a pantalla completa, para fuente de navegador |
| **Salida de repeticiones (OBS)** | https://localhost/display.html | Reproduce lo que se envíe desde Repeticiones |

Para comprobarlo todo de una vez: `pwsh scripts/smoke.ps1 -RequiereReplay -CompruebaRedireccion`.

> **Acceso por IP**: Para usar el Broadcaster desde otros dispositivos, usar `https://<IP_SERVIDOR>/broadcaster.html`. HTTPS es obligatorio para acceder a la cámara cuando no es localhost.

## Estructura del Proyecto

```
WebMTX/
├── server/                        # Servidor web Node.js (montado en el contenedor 'server')
│   ├── server.js                  # HTTPS :443 y redirección :80 (HTTP_REDIRECT)
│   ├── modules/app.js             # Estáticos, proxies /api/mediamtx y /api/playback, /api/replay (SSE)
│   ├── modules/marcados.js        # /api/marcados: momentos marcados compartidos (JSON en datos_volume + SSE)
│   ├── modules/sse.js             # Canal SSE reutilizable (repeticiones y marcas)
│   └── public/                    # Front: HTML/CSS/JS sin build
│       ├── index.html             # Inicio: cámaras en directo y herramientas
│       ├── broadcaster.html       # Emitir (WHIP)
│       ├── player.html            # Ver (WHEP)
│       ├── playback.html          # Repeticiones y control de la salida OBS
│       ├── archivo.html           # Archivo de tomas grabadas (miniaturas, filtros, descarga, borrado)
│       ├── stats.html             # Estadísticas (Chart.js servido desde /vendor)
│       ├── api.html               # Panel de la API v3 de MediaMTX
│       ├── neoplayer.html         # Salida OBS: una cámara a pantalla completa
│       ├── display.html           # Salida OBS: repeticiones
│       ├── css/                   # base.css (sistema de diseño) + una hoja por página; obs.css para las salidas
│       ├── fonts/                 # Archivo variable (OFL), autoalojada: funciona sin internet
│       ├── img/iconos.svg         # Iconos
│       └── js/
│           ├── <página>.js        # Lógica WebRTC / de cada página
│           ├── playback-marcados.js, playback-control.js, playback-display.js
│           ├── api/               # api.js (GET/POST/PATCH/DELETE) + secciones del panel
│           ├── ui/                # DOM y render: avisos.js, tally.js, <página>-ui.js
│           └── utils/             # utils.js, camaras.js, watchdog.js, *-utils.js, stats-charts.js
├── mediamtx/
│   ├── mediamtx.yml               # Configuración común (grabación, playback…); lo del equipo va en .env
│   └── logs/                      # mediamtx.log (montado como /logs)
├── scripts/                       # Utilidades (PowerShell / Node)
│   ├── gen-certs.ps1              # Certificados TLS con mkcert
│   ├── exportar-grabaciones.ps1   # Copia grabaciones del volumen Docker a disco
│   ├── streams-prueba.ps1         # Cámaras sintéticas con ffmpeg (cam1, cam2…)
│   ├── whep-view.ps1 / whep-receive.ps1  # Visores WHEP con GStreamer
│   ├── smoke.ps1                  # Prueba de humo del servidor
│   └── check-dom.mjs              # Contratos HTML↔JS del front
├── docker/node/Dockerfile
├── docker-compose.yml             # Servicios 'server' y 'mediamtx' (contenedor mediamtxTFG)
├── docs/                          # Material del TFG
│   ├── CAMS/                      # Emisores FFmpeg (WHIP, RTSP, SRT) y PYWHIP
│   ├── rpi/                       # Scripts para Raspberry Pi
│   ├── otros/                     # Notas técnicas y checklist-front.md (pruebas del front)
│   └── diagramas/
├── CLAUDE.md
└── README.md
```

Las grabaciones viven en el volumen Docker `recordings_volume` (no en una carpeta del repo): ver [Grabaciones](#grabaciones).

## Uso

### Emitir desde el navegador

`https://<IP_SERVIDOR>/broadcaster.html` convierte cualquier dispositivo con navegador (portátil, móvil, tablet) en una cámara.

1. **Destino**: escribe el nombre de la cámara o pulsa uno de los habituales (`cam1`, `cam2`, `movil`, `extra`). Los que ya están emitiendo se marcan con un punto rojo; si eliges uno ocupado, pide confirmación antes de reemplazarlo.
2. **Fuentes**: cámara y micrófono (o "Sin micrófono").
3. **Vídeo**: códec (H264 recomendado: es el que mejor se repite después), resolución y fps (solo los que admite la cámara), bitrate, prioridad del encoder, qué hacer si falta red o CPU y resolución enviada.
4. **Audio**: bitrate Opus y procesado del micrófono (eco, ruido, ganancia).
5. **Emitir**: la barra superior se pone en rojo con el cronómetro. Bitrate, prioridad, degradación, resolución enviada y bitrate de audio se pueden cambiar en directo sin cortar.

"Lo que se está enviando" muestra lo que entrega la cámara y lo que se codifica de verdad (resolución, fps, Mbps y si la CPU o la red están limitando). Los ajustes se recuerdan en el navegador.

### Emitir con FFmpeg u otros emisores

Para automatización o equipos sin interfaz gráfica:

```powershell
# Cámaras sintéticas para pruebas (sin hardware), se relanzan si MediaMTX se reinicia
pwsh .\scripts\streams-prueba.ps1 -Streams cam1,cam2

# Scripts del TFG (WHIP, RTSP, SRT, Raspberry Pi)
cd docs\CAMS\WHIP; .\test.bat
```

### Ver una cámara

`https://<IP_SERVIDOR>/player.html` lista las cámaras en directo (se actualiza sola). Un clic la abre en el monitor; `player.html?stream=cam1` la abre directamente. Si la conexión cae, se reconecta sola; el panel "Recepción" muestra imagen, bitrate, pérdidas y búfer.

Acceso WHEP directo sin la interfaz: `https://<IP_SERVIDOR>:8889/<cámara>`.

### Repeticiones

`https://<IP_SERVIDOR>/playback.html` está pensada para el operador de repeticiones (también funciona como dock de OBS de ~400 px):

- **Repetir al momento**: "Últimos 15 s / 30 s / 60 s" o "Desde hace N segundos". Se calcula contra el reloj, así que siempre sigue al directo, y la repetición no se detiene al alcanzarlo.
- **Línea temporal**: logarítmica (los últimos 5 minutos ocupan la mitad derecha). Arrastrarla elige el momento; la burbuja muestra la hora real.
- **Otros modos**: desde el inicio de una grabación (en segundos) o a una hora concreta.
- **Marcar**: guarda el instante de "hace N segundos" para pincharlo luego; cada momento se puede previsualizar, anotar o enviar a OBS.
- **Enviar a OBS / Quitar**: manda a `display.html` lo que se está previsualizando. La barra superior se pone en rojo mientras hay una repetición en directo.
- Velocidad de 0,25× a 4×.

> Playback no usa WebRTC: el navegador recibe fMP4 por HTTPS a través del proxy `/api/playback`.

### Salidas para OBS

Añádelas como **fuente de navegador** a 1920×1080. Dentro de OBS solo muestran vídeo sobre negro; los avisos (por ejemplo, audio bloqueado) solo aparecen al abrirlas en un navegador normal o con `?debug=1`.

| Salida | URL | Parámetros |
|--------|-----|------------|
| Cámara | `https://<IP>/neoplayer.html?stream=cam1` | `ajuste=cubrir` (rellena recortando), `fondo=transparente`, `debug=1` |
| Repeticiones | `https://<IP>/display.html` | `fondo=transparente` (deja ver la escena cuando no hay repetición), `debug=1` |

La página de Inicio copia estas URLs con un clic. Sin `?stream=`, `neoplayer.html` muestra un selector de cámaras.

### Estadísticas

`https://<IP_SERVIDOR>/stats.html`: paths, espectadores y tráfico total; gráficas de tráfico total, por cámara y espectadores; y una sección por cámara con mínimo, media y máximo. Se actualiza cada 1,5 s (configurable, se recuerda).

### Panel de la API

`https://<IP_SERVIDOR>/api.html`: acciones rápidas (recargar configuración, cerrar path, expulsar sesiones, borrar segmentos), paths (crear, modificar, cerrar), configuración global (ver y cambiar con PATCH; pulsar una clave la copia al formulario), sesiones RTSP/WebRTC/HLS y grabaciones. Las secciones se cargan al abrirlas.

## Grabaciones

MediaMTX graba todas las cámaras en fMP4 (segmentos de 10 minutos, se borran a los 7 días; ver `pathDefaults` en `mediamtx/mediamtx.yml`). Para no grabar una cámara, declárala en `paths:` con `record: no`.

Las grabaciones están en el volumen Docker `webmtx_recordings_volume`: el acceso aleatorio es mucho más rápido que en una carpeta compartida de Windows (medido: una repetición a 15 s del directo empieza a llegar en 0,12 s frente a 40 s).

```powershell
.\scripts\exportar-grabaciones.ps1 -Path cam1            # a mediamtx\grabaciones_exportadas
.\scripts\exportar-grabaciones.ps1 -Destino D:\copias    # todas, a otra carpeta
```

> ⚠️ `docker compose down -v` borra los volúmenes, **incluidas las grabaciones y los momentos marcados** (`datos_volume`). Usa `docker compose down` sin `-v`.

Los **momentos marcados** (Repeticiones y Archivo) se guardan en el servidor, en `marcados.json` dentro del volumen `webmtx_datos_volume`, y se comparten entre todos los equipos: una marca hecha en un ordenador aparece al momento en los demás.

## Puertos y Protocolos

| Puerto | Protocolo | Descripción | Latencia |
|--------|-----------|-------------|----------|
| **80** | HTTP | Redirige a HTTPS (`PUERTO_HTTP`; desactivable con `HTTP_REDIRECT=false`) | - |
| **443** | HTTPS | Servidor web, necesario para getUserMedia por IP (`PUERTO_HTTPS`) | - |
| **1935** | RTMP | Streaming RTMP | ~2-5s |
| **8554** | RTSP | Streaming RTSP | ~1-2s |
| **8888** | HTTPS | HLS (HTTP Live Streaming) | ~6-30s |
| **8889** | HTTPS | WebRTC (WHIP/WHEP) | **~100-300ms** |
| **8189** | UDP | WebRTC ICE | - |
| **9997** | HTTPS | API de control de MediaMTX (v3) | - |

No se publican al host (solo dentro de la red de Docker): **9996** (playback, se usa por el proxy `/api/playback`), **8890/UDP** (SRT) y **9998** (métricas). Si necesitas SRT desde fuera, añade `"8890:8890/udp"` en `docker-compose.yml`.

## Configuración con .env

`docker-compose.yml` lee el `.env` de la raíz (plantilla: `.env.example`) y pasa a cada contenedor **solo** lo que necesita. Lo que depende del equipo nunca se escribe en `mediamtx.yml` ni en el compose: MediaMTX lo recibe como variables `MTX_*`, que sobrescriben su yml.

| Variable | Por defecto | Qué hace |
|----------|-------------|----------|
| `IP_EQUIPO` | *obligatoria* | IP de este equipo en la red local. Se anuncia a los navegadores para WebRTC (`MTX_WEBRTCADDITIONALHOSTS`). `gen-certs.ps1` también la mete en el certificado |
| `PUERTO_HTTPS` | `443` | Puerto HTTPS publicado en el equipo; la redirección del 80 apunta a él |
| `PUERTO_HTTP` | `80` | Puerto publicado para la redirección a HTTPS; cámbialo si el 80 lo usa otro servicio |
| `HTTP_REDIRECT` | `true` | `false` no escucha en el puerto HTTP |
| `RETENCION_GRABACIONES` | `7d` | Cuánto se conservan las grabaciones (`MTX_PATHDEFAULTS_RECORDDELETEAFTER`); `0s` = siempre |
| `NIVEL_LOG_MEDIAMTX` | `info` | `error`, `warn`, `info` o `debug` (`MTX_LOGLEVEL`) |
| `NODE_ENV` | `production` | `production` no muestra detalles internos en las respuestas de error |

- **Aplicar cambios:** `docker compose up -d`. `restart` no vuelve a leer el `.env`.
- **Comprobar qué valores se usan:** `docker compose config`. El servidor Node también escribe su configuración efectiva al arrancar (`docker compose logs server`).
- **Sin Docker:** `cd server; npm run start:local` usa el mismo `.env` (Node 22 o superior).
- Las variables internas (`MEDIAMTX_HOST`, `PLAYBACK_HOST`, `PLAYBACK_PORT`) están fijas en el compose porque dependen de la red de Docker.

## API MediaMTX

La API REST está disponible en el puerto 9997:

```bash
# Listar streams activos
curl https://localhost:9997/v3/paths/list

# Obtener información de un stream
curl https://localhost:9997/v3/paths/get/cam1

# Estadísticas del servidor
curl https://localhost:9997/v3/hlsmuxers/list
```

> **Nota**: En la interfaz web, estas llamadas se exponen a través del proxy `/api/mediamtx/*`. Las grabaciones y reproducción se exponen mediante `/api/playback/*`.

## Configuración avanzada

### Parámetros FFmpeg recomendados para baja latencia

```bash
-c:v libx264 
-preset ultrafast 
-tune zerolatency 
-profile:v baseline 
-level 3.1 
-g 30                    # GOP size (keyframe cada 30 frames)
-bf 0                    # Sin B-frames
-x264-params "keyint=30:min-keyint=30:no-scenecut=1"
```

### Configuración de audio

```bash
-c:a libopus 
-b:a 128k 
-ar 48000 
-ac 2 
-application lowdelay
```

## Solución de problemas

### El stream no se reproduce

1. Verificar que MediaMTX está corriendo: `docker compose ps`
2. Comprobar logs: `docker compose logs mediamtx` o `mediamtx\logs\mediamtx.log`
3. Verificar que FFmpeg está enviando correctamente: buscar "WHIP session established" en los logs
4. Si la cámara se ve en local pero no desde otro equipo: la IP del servidor debe ser la `IP_EQUIPO` del `.env` (`.env`, aplicado con `docker compose up -d`) y en el certificado (`scripts\gen-certs.ps1`)

### Las repeticiones no se reproducen

- Emite en **H264**: el navegador no decodifica todos los códecs que WebRTC puede enviar (H265, VP9, AV1 dependen del equipo).
- Lo grabado hace menos de ~4 s todavía no está en disco; la página deja ese margen automáticamente.

### No arranca el servidor web

Faltan `server/cert.pem` y `server/key.pem`: genera los certificados con `.\scripts\gen-certs.ps1 -IPsLocales`.

### Alta latencia

1. Usar preset `ultrafast` en FFmpeg
2. Activar `zerolatency` tune
3. Reducir GOP size (`-g 30`)
4. Desactivar B-frames (`-bf 0`)

### Error de conexión ICE

1. Verificar que el puerto UDP 8189 está abierto
2. Comprobar configuración de firewall
3. En redes NAT, puede ser necesario configurar STUN/TURN

### FFmpeg no encuentra la cámara

```bash
# Windows - Listar dispositivos
ffmpeg -list_devices true -f dshow -i dummy

# Linux - Listar dispositivos
v4l2-ctl --list-devices

# Python
python docs/CAMS/list_devices.py
```

## Desarrollo

### Arquitectura de módulos JavaScript

El front no tiene build ni módulos ES: cada página carga `<script>` clásicos que comparten el ámbito global, y el orden de las etiquetas es el grafo de dependencias.

```
js/
├── api/              # api.js (GET/POST/PATCH/DELETE contra /api/mediamtx/v3) + secciones del panel
├── ui/               # DOM y render: avisos.js (avisos y confirmaciones), tally.js, <página>-ui.js
├── utils/            # utils.js, camaras.js (color por cámara), watchdog.js, *-utils.js, stats-charts.js
└── <página>.js       # Lógica de cada página (WebRTC, repeticiones…)
```

- `css/base.css` contiene el sistema de diseño: tokens de color (incluida la paleta de cámaras, validada para daltonismo sobre el fondo oscuro), tipografía, componentes y la barra de tally. Rojo = en directo, verde = recibiendo, ámbar = conectando.
- Las funciones llamadas desde `onclick`/`data-load` y los ids que usa el JS son contrato. Antes de dar un cambio por bueno:

```powershell
node scripts/check-dom.mjs                                # ids, handlers, globales duplicados, node --check
pwsh scripts/smoke.ps1 -RequiereReplay -CompruebaRedireccion
```

- `docs/otros/checklist-front.md` es el checklist funcional de todas las páginas.

### Reiniciar servicios

```powershell
docker compose restart server     # tras tocar server/*.js (el front no necesita reinicio)
docker compose down               # sin -v: -v borra las grabaciones y las marcas
docker compose up -d --build
```

Si cambian las dependencias de `server/package.json`, borra el volumen de `node_modules` para que se regenere: `docker volume rm webmtx_node_modules_volume`.

### Ver logs en tiempo real

```powershell
docker compose logs -f
Get-Content .\mediamtx\logs\mediamtx.log -Tail 20 -Wait
```

### Acceder al contenedor

```powershell
docker exec -it server sh
```

La imagen de MediaMTX no incluye shell; para ver sus ficheros usa `docker cp` o `scripts\exportar-grabaciones.ps1`.

## Tecnologías

| Tecnología | Uso |
|------------|-----|
| **[MediaMTX](https://github.com/bluenviron/mediamtx)** | Servidor de medios multi-protocolo |
| **[FFmpeg](https://ffmpeg.org/)** | Codificación y transmisión de vídeo |
| **[WebRTC](https://webrtc.org/)** | Comunicación en tiempo real (WHIP/WHEP) |
| **[Node.js](https://nodejs.org/)** | Runtime JavaScript para el servidor web |
| **[Express](https://expressjs.com/)** | Framework web (proxy API, archivos estáticos) |
| **[Docker](https://www.docker.com/)** | Contenedorización de servicios |
| **JavaScript vanilla** | Frontend interactivo sin dependencias framework |

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## Autor

**Ricardo Román Martínez**  
Trabajo Fin de Grado - Universidad Politécnica de Valencia (UPV)

---

<p align="center">
  <i>Desarrollado como parte del Trabajo Fin de Grado en la UPV</i>
</p>
