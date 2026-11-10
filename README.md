# WebMTX: streaming WebRTC de baja latencia

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

Sistema de streaming de vídeo en tiempo real con latencia ultra-baja (~100-300ms) utilizando WebRTC, FFmpeg y MediaMTX, con una interfaz web de sala de realización: emitir, ver, repetir, archivo de grabaciones y salidas para OBS.

> **Trabajo Fin de Grado - Universidad Politécnica de Valencia**  
> Diseño e implementación de un sistema de distribución de video de baja latencia basado en WebRTC y MediaMTX para realización en directo.

## Descripción

Este proyecto implementa un sistema completo de transmisión de vídeo con baja latencia utilizando el protocolo WebRTC. Permite capturar vídeo desde diferentes fuentes (cámaras USB, webcams, capturadoras, pantalla) y transmitirlo a través de un servidor web con visualización en tiempo real.

### Características principales

- **Ultra baja latencia**: ~100-300ms gracias a WebRTC
- **Multi-protocolo**: Soporte para WHIP/WHEP, RTSP, RTMP, HLS y SRT
- **Multiplataforma**: Scripts para Windows, Mac, Android, Linux y Raspberry Pi
- **Interfaz web de sala de realización** (HTML/CSS/JS sin dependencias de build, tema oscuro y claro, responsive hasta móvil y dock de OBS):
  - Emitir (broadcaster WHIP desde el navegador): cámara, formato y micro se cambian en directo sin cortar, con previo y programa al cambiar de cámara
  - Ver (player WHEP con reconexión automática)
  - Repeticiones (repetición "hace N segundos", línea temporal, momentos marcados y envío a OBS)
  - Archivo (todas las tomas grabadas con miniatura: ver, enviar a OBS, descargar en MP4 y borrar)
  - Momentos marcados compartidos entre todos los equipos conectados
  - Salidas para OBS: cámara a pantalla completa (`neoplayer.html`) y repeticiones (`display.html`)
  - Estadísticas en tiempo real y panel de la API de MediaMTX
  - Reloj en la cabecera con la hora del servidor (la de las grabaciones)
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

El servidor Node.js (Express) es una capa fina delante de MediaMTX: el navegador hace todo el WebRTC directamente contra MediaMTX y Node sirve la web por HTTPS y estas rutas:

| Ruta | Qué hace |
|------|----------|
| `/api/mediamtx/*` | Proxy a la API de control de MediaMTX (`:9997`, v3), sin problemas de CORS ni de certificados |
| `/api/playback/*` | Proxy al servidor de grabaciones (`:9996`, que no se publica): el vídeo de repeticiones y archivo |
| `/api/replay/*` | Control de la salida de repeticiones para OBS (`display.html`), con eventos SSE |
| `/api/marcados/*` | Momentos marcados compartidos entre equipos (guardados en el volumen `datos_volume`, avisos por SSE) |

> **HTTPS**: el servidor usa HTTPS (puerto 443) con certificados mkcert, necesario para `getUserMedia()` desde cualquier dispositivo que acceda por IP (no localhost).

### Flujo de datos

1. **Captura (Fuentes)**: Cámaras, micrófonos, pantalla o capturadoras proporcionan el contenido multimedia
2. **Emisión (WHIP)**: FFmpeg, scripts Python o el Broadcaster web codifican el vídeo y lo envían al servidor MediaMTX mediante protocolo WHIP
3. **Servidor (MediaMTX)**: Recibe los streams y los redistribuye a los clientes conectados
4. **Reproducción (WHEP)**: Los navegadores se conectan mediante WebRTC para visualización en tiempo real
5. **Monitoreo**: Dashboard de estadísticas obtiene métricas en tiempo real via API REST
6. **Control**: la API v3 de MediaMTX permite gestionar configuración, paths, grabaciones y sesiones
7. **Repeticiones y archivo**: MediaMTX graba cada cámara en fMP4; Repeticiones y Archivo lo reproducen por el proxy de playback y lo envían a OBS (`display.html`) por SSE
8. **Marcados**: los momentos marcados se guardan en el servidor y llegan por SSE a todos los equipos abiertos

## Requisitos

### Para el servidor (Docker)
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM mínimo
- Puertos disponibles: 443, 1935, 8554, 8888, 8889, 8189/UDP, 9997 y, si se usa la redirección, 80
- mkcert (certificados TLS locales)

### Para emisión desde Windows
- FFmpeg compilado con soporte WebRTC/WHIP (ver `docs/otros/compilacion_todo_junto.md`)
- Cámara USB o capturadora compatible

### Para emisión desde Raspberry Pi
- Raspberry Pi 4 (recomendado)
- FFmpeg compilado con soporte WebRTC/WHIP (ver `docs/otros/compilacion_ffmpeg_webrtc.md`)
- Cámara USB o módulo de cámara Pi

### Para emitir o ver desde el navegador
- Chrome, Edge o Safari recientes. Para emitir por IP hace falta HTTPS (ver [paso 4](#4-configurar-https-con-mkcert)).

### Opcional
- Python 3.8+ (para scripts PYWHIP)
- FFmpeg con OpenSSL y WHIP ya compilado para Windows: ver [paso 2](#2-descargar-el-wffmpeg-windows)

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Luigiverde4/WebMTX.git
cd WebMTX
```

> Docker Compose usa el nombre de la carpeta como prefijo de los volúmenes: con `WebMTX` son `webmtx_recordings_volume`, `webmtx_datos_volume` y `webmtx_node_modules_volume`, los nombres que usan los comandos de este README.


### 2. Descargar el wffmpeg (Windows)

Para emitir streams con WebRTC/WHIP desde Windows, necesitas una versión de FFmpeg compilada con soporte OpenSSL y WHIP:

**[⬇️ Descargar wffmpeg](https://1drv.ms/f/c/d02daa2df2a2a690/IgB3e318fCdvRr6S5Q1w_hRNAU3r8oo8cSc6gcB4LQObLE8?e=9UIHiV)**

Descomprime el archivo y añade la carpeta `bin` al PATH del sistema, o colócala en la raíz del proyecto.

> **Nota**: Si prefieres compilar FFmpeg tú mismo, consulta `docs/otros/compilacion_todo_junto.md`

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
│       ├── css/                   # tokens.css (valores) + base.css (componentes) + una hoja por página; obs.css para las salidas
│       ├── fonts/                 # Archivo variable (OFL), autoalojada: funciona sin internet
│       ├── img/iconos.svg         # Iconos
│       └── js/
│           ├── <página>.js        # Lógica WebRTC / de cada página (el principal; el de display.html es playback-display.js)
│           ├── <página>-<parte>.js  # Partes de la lógica de esa página, cargadas tras su principal:
│           │                      #   broadcaster-captura.js (cámara, formato y micro en directo; previo y programa)
│           │                      #   playback-marcados.js (momentos marcados)
│           ├── api/               # api.js (GET/POST/PATCH/DELETE) + secciones del panel
│           ├── ui/                # DOM y render: avisos.js, tally.js, reloj.js, <página>-ui.js
│           └── utils/             # Helpers puros y código compartido entre páginas:
│                                  #   grabaciones.js, salida-obs.js, marcados.js, miniaturas.js (Repeticiones y Archivo)
│                                  #   estado-emision.js (máquina de estados de Emitir), camaras.js, watchdog.js…
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
│   ├── otros/                     # Notas técnicas, checklist-front.md y estudio-ajustes-emisor.md
│   └── diagramas/
├── CLAUDE.md
└── README.md
```

Las grabaciones viven en el volumen Docker `recordings_volume` y los momentos marcados en `datos_volume` (no en carpetas del repo): ver [Grabaciones](#grabaciones).

## Uso

### Emitir desde el navegador

`https://<IP_SERVIDOR>/broadcaster.html` convierte cualquier dispositivo con navegador (portátil, móvil, tablet) en una cámara.

1. **Fuentes**: cámara y micrófono (o "Sin micrófono"). "Buscar dispositivos" vuelve a listarlos si conectas uno nuevo.
2. **Destino**: escribe el nombre de la cámara o pulsa uno de los habituales (`cam1`, `cam2`, `movil`, `extra`). Los que ya están emitiendo se marcan con un punto rojo; si eliges uno ocupado, pide confirmación antes de reemplazarlo.
3. **Captura**: códec, resolución pedida, fps pedidos y procesado del micrófono (eco, ruido, ganancia).
   - El códec por defecto es **H264**, el que mejor se graba y se repite. VP8 no se ofrece porque MediaMTX no lo graba; VP9, AV1 y H265 avisan de sus limitaciones.
4. **Calidad del envío**: bitrate máximo de vídeo, qué sacrificar si no da para todo (fluidez, nitidez o un poco de cada), reducir la imagen al enviar y calidad del audio (sale en mono: MediaMTX no negocia Opus estéreo).
5. **Emitir**: la barra superior (tally) se pone en rojo con el cronómetro. Es el único sitio donde se lee el estado de la emisión, también los errores.

**Ajustes objetivo.** Resolución, fps y bitrate llevan la etiqueta *objetivo*: los pide la página, pero el resultado lo deciden la cámara, la CPU y la red. Debajo se ve el valor real; si no coincide, sale en ámbar con el motivo ("la cámara no da más", "falta CPU", "falta red"…). El panel "Tráfico por pista" muestra lo que se envía de verdad. Los ajustes se recuerdan en el navegador, menos el bitrate de vídeo: siempre arranca al máximo (20 Mbps), porque es un techo y la red decide cuánto se envía.

**Cambios en directo, sin cortar.** Emitiendo, se puede cambiar casi todo sobre la misma conexión:

- **Otra cámara** se abre primero en el **previo** (monitor pequeño con borde verde) mientras el monitor grande, el **programa** (rojo), sigue mostrando lo que sale. "Pasar a directo" la saca sin cortar y "Descartar" cierra el previo.
- Resolución, fps, micrófono, procesado y toda la calidad del envío se aplican al momento.
- Solo el códec, el nombre de la cámara y pasar de "Sin micrófono" a un micrófono cambian la propia conexión. En esos casos el botón pasa a "Volver a emitir", con "Deshacer cambios" al lado.
- Si la cámara nueva no abre (ocupada, desconectada o sin ese formato), se vuelve a la anterior y se avisa del motivo.

**Desde el móvil.** En vertical, tally, monitor y botones se quedan arriba mientras los ajustes pasan por debajo. Con el móvil tumbado entra en *modo cámara*: el monitor ocupa todo el alto a la izquierda y los ajustes van a la derecha. El botón sobre el monitor lo pone a pantalla completa.

> Por qué cada ajuste está donde está (medido con Chrome contra MediaMTX): `docs/otros/estudio-ajustes-emisor.md`.

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
- **Salida a OBS**: es el último paso de la columna "Qué repetir" (elegir, reproducir y enviar). "Enviar a OBS" se activa cuando hay algo previsualizado y manda a `display.html` lo que se ve; "Quitar" se activa cuando hay algo en la salida. La barra superior se pone en rojo mientras hay una repetición en directo.
- **Momentos marcados**: "Marcar" guarda lo que acaba de pasar (el botón dice qué cámara e instante); cada momento se puede previsualizar, anotar o enviar a OBS. Se guardan en el servidor, así que **todos los equipos ven las mismas marcas** al momento, también las hechas desde Archivo.
- Velocidad de 0,25× a 4× (se mantiene al encadenar tramos).

> Playback no usa WebRTC: el navegador recibe fMP4 por HTTPS a través del proxy `/api/playback`.

### Archivo

`https://<IP_SERVIDOR>/archivo.html` enseña todo lo grabado como **tomas**: una toma va desde que una cámara empieza a emitir hasta que para, aunque MediaMTX la guarde en segmentos de 10 minutos.

- **Lista**: tarjetas con miniatura, cámara, inicio, fin (o "En directo") y duración, agrupadas por día. Se filtra por cámara y fecha (hoy, ayer, últimos 7 días), se pueden ocultar las tomas de menos de 10 s y se ordena por fecha o duración. Los filtros se recuerdan.
- **Visor**: la barra va del inicio al fin de la toma y, al soltarla, reproduce desde ese instante.
- **Acciones**:
  - "Enviar a OBS" manda la toma desde ese instante y el display sigue hasta el final.
  - "Marcar" guarda el instante en los momentos marcados de Repeticiones.
  - También se puede quitar de OBS, descargar en MP4 o borrar la toma (pide confirmación y no se puede mientras sigue grabando).
- La toma que está en la salida de OBS lleva el borde rojo, la haya enviado Archivo o Repeticiones.

Las miniaturas las genera el navegador (un fotograma del primer segundo) y se guardan en caché en IndexedDB, así que solo se calculan la primera vez.

### Reloj

Todas las páginas de operador muestran la hora arriba a la derecha. Si el reloj del equipo va desfasado más de 1,5 s respecto al servidor, muestra la hora del servidor, que es la que llevan las grabaciones: así "repetir desde las 18:42:10" cuadra en todos los equipos. Las salidas de OBS no lo muestran.

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

Para ver, descargar en MP4 o borrar tomas sueltas, usa la página [Archivo](#archivo). Para sacar muchas a disco de una vez:

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
4. Si la cámara se ve en local pero no desde otro equipo: `IP_EQUIPO` en el `.env` debe ser la IP actual de este equipo en la red (aplícala con `docker compose up -d`) y esa IP debe estar en el certificado (`.\scripts\gen-certs.ps1 -IPsLocales -Force`)

### Las repeticiones no se reproducen

- Emite en **H264**: el navegador no decodifica todos los códecs que WebRTC puede enviar (H265, VP9, AV1 dependen del equipo) y MediaMTX no graba VP8.
- Lo grabado hace menos de ~4 s todavía no está en disco; la página deja ese margen automáticamente.

### No arranca el servidor web

Faltan `server/cert.pem` y `server/key.pem`: genera los certificados con `.\scripts\gen-certs.ps1 -IPsLocales`.

### Alta latencia

1. Usar preset `ultrafast` en FFmpeg
2. Activar `zerolatency` tune
3. Reducir GOP size (`-g 30`)
4. Desactivar B-frames (`-bf 0`)

### Error de conexión ICE

1. Comprobar que `IP_EQUIPO` es la IP actual del equipo: si has cambiado de red, cámbiala en el `.env` y aplica con `docker compose up -d`
2. Verificar que el puerto UDP 8189 está abierto
3. Comprobar configuración de firewall
4. En redes NAT, puede ser necesario configurar STUN/TURN

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
├── ui/               # DOM y render: avisos.js (avisos y confirmaciones), tally.js, reloj.js, <página>-ui.js
├── utils/            # Helpers puros y código compartido (grabaciones, salida-obs, marcados, miniaturas, estado-emision…)
└── <página>.js       # Lógica de cada página (WebRTC, repeticiones…)
```

Nunca repitas un `let`/`const` de nivel superior entre scripts de la misma página: al compartir ámbito da `SyntaxError` (`check-dom.mjs` lo detecta).

**CSS** (sistema de diseño "sala de realización"):

- **Valores solo en `css/tokens.css`**, en dos niveles: paleta base (`--gris-900`, `--rojo-500`…) y tokens de uso (`--fondo`, `--texto`, `--programa`…). El resto de hojas solo usa los tokens de uso. La paleta de cámaras (azul, naranja, cian, magenta y violeta) está validada para daltonismo en los dos temas.
- **Capas** `@layer reset, base, componentes, paginas, utilidades`: `base.css` define los componentes y cada hoja de página va entera en `paginas`. `[hidden]` está en `utilidades` y siempre gana.
- **Breakpoints** solo en 600, 900 y 1280 px; lo que puede acabar en un hueco estrecho (dock de OBS) usa *container queries*.
- **Tema** oscuro por defecto y claro automático (`prefers-color-scheme`); las salidas de OBS siempre son oscuras.
- Rojo = en directo / programa, verde = recibiendo / previo, ámbar = conectando o aviso. El rojo y el verde se reservan para el tally.

Las funciones llamadas desde `onclick`/`data-load` y los ids que usa el JS son contrato. `check-dom.mjs` también falla si hay un color literal fuera de `tokens.css`, un `!important` sin justificar o un `.style.x` en el JS. Antes de dar un cambio por bueno:

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
| **[Express](https://expressjs.com/)** | Framework web (proxies, archivos estáticos, SSE) |
| **[Chart.js](https://www.chartjs.org/)** | Gráficas de la página de estadísticas (servido desde `/vendor`) |
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
