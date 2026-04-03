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
- **Multiplataforma**: Scripts para Windows, Linux y Raspberry Pi
- **Interfaz web**: Reproductor integrado con controles intuitivos
- **Containerizado**: Despliegue sencillo con Docker Compose
- **API de control**: Gestión de streams mediante API HTTP

## Índice

- [Arquitectura](#arquitectura)
- [Flujo de datos](#flujo-de-datos)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Uso](#uso)
- [Puertos y Protocolos](#puertos-y-protocolos)
- [API MediaMTX](#api-mediamtx)
- [Configuración avanzada](#configuración-avanzada)
- [Solución de problemas](#solución-de-problemas)
- [Desarrollo](#desarrollo)
- [Tecnologías](#tecnologías)
- [Licencia](#licencia)
- [Autor](#autor)

## Arquitectura

```mermaid
flowchart LR
  subgraph F[Fuentes]
    cams[Cámaras]
    mics[Micrófonos]
    screen[Pantalla]
    more[...]
  end

  subgraph E[Emisores]
    ffwin[FFmpeg (Windows)]
    ffrpi[FFmpeg (Raspberry Pi)]
    pywhip[Python / PYWHIP]
    browserWhip[Broadcaster web\n(WHIP desde el navegador)]
  end

  subgraph S[Servidor]
    mediamtx[MediaMTX\n8889 WebRTC\n9997 API REST]
    node[Node.js / Express\n80 HTTP\n443 HTTPS]
    apiProxy[/api/mediamtx/*\nProxy a la API REST/]
    playbackProxy[/api/playback/*\nProxy a grabaciones y reproducción/]
  end

  subgraph C[Clientes]
    browser[Browser]
    player[Player web]
    playback[Playback web]
    obs[OBS / VLC]
  end

  cams --> ffwin
  cams --> ffrpi
  cams --> pywhip
  cams --> browserWhip
  mics --> ffwin
  mics --> ffrpi
  mics --> pywhip
  mics --> browserWhip
  screen --> ffwin
  screen --> pywhip
  screen --> browserWhip
  more --> ffwin
  more --> pywhip

  ffwin -->|WHIP| mediamtx
  ffrpi -->|WHIP| mediamtx
  pywhip -->|WHIP| mediamtx
  browserWhip -->|WHIP| mediamtx

  browser <-->|WebRTC / WHEP| mediamtx
  player <-->|WebRTC / WHEP| mediamtx
  obs <-->|RTSP / HLS / WebRTC| mediamtx

  browser --> node
  player --> node
  playback --> node

  node --> apiProxy
  node --> playbackProxy
  apiProxy --> mediamtx
  playbackProxy --> mediamtx

  node -. HTTP .-> browser
  node -. HTTPS .-> player
  node -. HTTPS .-> playback
```

> **Proxy API**: El servidor Node.js incluye un proxy en `/api/mediamtx/*` que redirige peticiones a la API REST de MediaMTX (puerto 9997), evitando problemas de CORS.
>
> **Playback proxy**: El servidor Node.js incluye un proxy en `/api/playback/*` para reenviar peticiones al servicio de grabaciones/reproducción (puerto 9996) sin exponer ese backend al navegador.
>
> **HTTPS**: El servidor soporta HTTPS (puerto 443) con certificados mkcert, necesario para usar `getUserMedia()` desde cualquier dispositivo que acceda por IP (no localhost).

### Flujo de datos

1. **Captura (Fuentes)**: Cámaras, micrófonos, pantalla o capturadoras proporcionan el contenido multimedia
2. **Emisión (WHIP)**: FFmpeg, scripts Python o el Broadcaster web codifican el vídeo y lo envían al servidor MediaMTX mediante protocolo WHIP
3. **Servidor (MediaMTX)**: Recibe los streams y los redistribuye a los clientes conectados
4. **Reproducción (WHEP)**: Los navegadores se conectan mediante WebRTC para visualización en tiempo real

## Requisitos

### Para el servidor (Docker)
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM mínimo
- Puertos disponibles: 80, 443, 1935, 8554, 8888, 8889, 8189/UDP, 9997

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

### 3. Configurar MediaMTX (IMPORTANTE)

Editar `mediamtx/mediamtx.yml` y configurar la IP de tu máquina para que los clientes WebRTC puedan conectarse:

```yaml
# Buscar la línea webrtcAdditionalHosts y agregar tu IP local
webrtcAdditionalHosts: ['192.168.X.X']  # Cambiar por tu IP
```

Para obtener tu IP:
```bash
# Windows
ipconfig

# Linux/macOS
ip addr show | grep inet
```

> **Nota**: Esta configuración es necesaria para que los navegadores de otros dispositivos en la red local puedan reproducir el stream.

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

```bash
# Instalar CA local (solo la primera vez)
mkcert -install

# Generar certificados para localhost y tu IP
cd server
mkcert localhost 127.0.0.1 192.168.X.X  # Cambiar por tu IP

# Renombrar los archivos generados
mv localhost+2.pem cert.pem
mv localhost+2-key.pem key.pem
```

> **Nota**: Los certificados deben estar en la carpeta `server/` con los nombres `cert.pem` y `key.pem`. Si no se encuentran, el servidor funcionará solo con HTTP.

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
| **Index** | http://localhost/ | Página principal con acceso a todas las herramientas |
| **Broadcaster** | https://localhost/broadcaster.html | Emitir stream desde el navegador (cámara/micrófono) |
| **Player** | http://localhost/player.html | Reproductor WebRTC principal |
| **Playback** | http://localhost/playback.html | Reproductor con controles avanzados |
| **API Control** | http://localhost/api-control.html | Panel de control de la API |

> **Acceso por IP**: Para usar el Broadcaster desde otros dispositivos, usar `https://<IP_SERVIDOR>/broadcaster.html`. HTTPS es obligatorio para acceder a la cámara cuando no es localhost.

## Estructura del Proyecto

```
TFG/
├── CAMS/                      # Scripts de captura y streaming
│   ├── WHIP/                  # Scripts FFmpeg para WebRTC (Windows)
│   │   ├── test.bat           # Stream de prueba (testsrc)
│   │   ├── webcam.bat         # Stream desde webcam
│   │   └── multi_*.bat        # Configuraciones cámaras de Multi
│   ├── RTSP/                  # Scripts para streaming RTSP
│   ├── SRT/                   # Scripts para streaming SRT
│   └── PYWHIP/                # Scripts Python para streaming
│       ├── pywhip.py          # Emisor WHIP en Python
│       └── pywhip_screen.py   # Captura de pantalla
├── server/                    # Servidor web Node.js
│   ├── server.js              # Servidor Express (puerto 80)
│   └── public/                # Archivos estáticos
│       ├── index.html         # Página principal
│       ├── broadcaster.html   # Emisor WHIP desde navegador
│       ├── player.html        # Reproductor principal
│       ├── playback.html      # Reproductor avanzado
│       ├── api-control.html   # Control de API
│       ├── js/                # Scripts JavaScript
│       │   ├── herramientas.js # Utilidades compartidas (escapeHtml, formatBytes)
│       │   ├── watchdog.js     # Watchdog compartido de tráfico
│       │   ├── broadcaster-ui.js # UI y dispositivos del broadcaster
│       │   ├── broadcaster.js  # Lógica de emisión WHIP/WebRTC
│       │   ├── playback-utils.js # Formateos específicos de playback
│       │   ├── playback-ui.js  # UI y eventos del reproductor de grabaciones
│       │   ├── playback-core.js # Carga y reproducción de grabaciones
│       │   ├── playback.js     # Bootstrap mínimo de playback
│       │   ├── player.js       # Reproductor WHEP
│       │   └── api.js          # Cliente y helpers de la API
│       └── css/               # Estilos CSS
├── mediamtx/                  # Configuración de MediaMTX
│   ├── mediamtx.yml           # Configuración del servidor
│   └── recordings/            # Directorio para grabaciones
├── docker/                    # Dockerfiles
│   └── node/
│       └── Dockerfile         # Imagen Node.js
├── rpi/                       # Scripts para Raspberry Pi
│   ├── stream_mjpeg_high.sh   # MJPEG 1080p con audio
│   ├── stream_yuv_high.sh     # YUV 1080p con audio
│   └── multi_*.sh             # # Configuraciones cámaras de Multi
├── docs/                      # Documentación adicional
│   ├── compilacion_ffmpeg_webrtc.md
│   └── webRTC2webRTCLL.md
├── docker-compose.yml         # Orquestación de servicios
└── README.md
```

## Uso

### Iniciar streaming de prueba (Windows)

```bash
cd CAMS/WHIP
.\test.bat
```

Esto envía un stream de prueba (testsrc + tono de audio) al servidor.

### Iniciar streaming desde webcam (Windows)

```bash
cd CAMS/WHIP
.\webcam.bat
```

### Iniciar streaming desde Raspberry Pi

```bash
cd rpi
chmod +x stream_mjpeg_high.sh
./stream_mjpeg_high.sh
```

### Iniciar streaming desde el navegador (Broadcaster)

El Broadcaster permite emitir directamente desde cualquier dispositivo con navegador (PC, móvil, tablet):

1. Abrir http://localhost/broadcaster.html (o `https://<IP>` si accedes por IP)
2. Seleccionar la cámara y micrófono a usar
3. Elegir la resolución deseada 
4. Introducir un nombre para el endpoint (ej: `cam1`, `movil`)
5. Hacer clic en **🔴 Iniciar Transmisión**

> **Nota**: El Broadcaster utiliza el protocolo WHIP nativo del navegador para enviar el stream a MediaMTX, igual que FFmpeg pero sin necesidad de instalar software adicional.
>
> **Acceso por IP**: Requiere HTTPS para acceder a la cámara. Usa `https://<IP>/broadcaster.html` con certificados mkcert. Desde `localhost` funciona sin HTTPS.

### Reproducir el stream (WHEP)

El reproductor utiliza el protocolo **WHEP** (WebRTC-HTTP Egress Protocol) para recibir el stream con ultra baja latencia.

**Desde el mismo equipo:**
1. Abrir http://localhost/player.html
2. Configurar el nombre del stream (por defecto: `whipLL`)
3. Hacer clic en **▶ Reproducir**

**Desde otro dispositivo en la red:**
1. Abrir `http://<IP_SERVIDOR>/player.html` (ej: http://192.168.1.100/player.html)
2. Configurar el servidor con la IP del equipo que ejecuta MediaMTX
3. Hacer clic en **▶ Reproducir**

**Visualización directa via WHEP (sin interfaz web):**

También puedes acceder directamente al stream via WHEP desde cualquier cliente compatible:
```
http://<IP_SERVIDOR>:8889/<nombre_stream>
```
Ejemplo: `http://192.168.1.100:8889/whipLL`

### Reproducir grabaciones (Playback)

El reproductor de grabaciones consulta primero la API de control de MediaMTX para listar los paths grabados y después usa el servicio de playback para obtener los fragmentos fMP4.

**Desde el mismo equipo:**
1. Abrir http://localhost/playback.html
2. Elegir un stream grabado
3. Seleccionar el punto de inicio o el modo lookback
4. Pulsar **▶ Reproducir desde tiempo seleccionado**

**Desde otro dispositivo en la red:**
1. Abrir `http://<IP_SERVIDOR>/playback.html`
2. Cargar la lista de grabaciones
3. Reproducir la grabación deseada

> **Tecnología**: Playback no usa WebRTC. El navegador recibe vídeo fMP4 por HTTP y lo reproduce con el elemento `<video>`.

## Puertos y Protocolos

| Puerto | Protocolo | Descripción | Latencia |
|--------|-----------|-------------|----------|
| **80** | HTTP | Servidor web (interfaz) | - |
| **443** | HTTPS | Servidor web seguro (requerido para getUserMedia por IP) | - |
| **1935** | RTMP | Streaming RTMP | ~2-5s |
| **8554** | RTSP | Streaming RTSP | ~1-2s |
| **8888** | HTTP | HLS (HTTP Live Streaming) | ~6-30s |
| **8889** | HTTP | WebRTC (WHIP/WHEP) | **~100-300ms** |
| **8189** | UDP | WebRTC ICE/STUN | - |
| **9997** | HTTP | API REST MediaMTX | - |
| **9996** | HTTP | Playback server (fMP4) | - |

## API MediaMTX

La API REST está disponible en el puerto 9997:

```bash
# Listar streams activos
curl http://localhost:9997/v3/paths/list

# Obtener información de un stream
curl http://localhost:9997/v3/paths/get/whipLL

# Estadísticas del servidor
curl http://localhost:9997/v3/hlsmuxers/list
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
2. Comprobar logs: `docker compose logs mediamtx`
3. Verificar que FFmpeg está enviando correctamente: buscar "WHIP session established" en los logs

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
python CAMS/list_devices.py
```

## Desarrollo

### Reiniciar servicios

```bash
docker compose down
docker compose up --build
```

### Ver logs en tiempo real

```bash
docker compose logs -f
```

### Acceder al contenedor

```bash
docker exec -it server sh
docker exec -it mediamtx sh
```

## Tecnologías

| Tecnología | Uso |
|------------|-----|
| **[MediaMTX](https://github.com/bluenviron/mediamtx)** | Servidor de medios multi-protocolo |
| **[FFmpeg](https://ffmpeg.org/)** | Codificación y transmisión de vídeo |
| **[WebRTC](https://webrtc.org/)** | Comunicación en tiempo real (WHIP/WHEP) |
| **[Node.js](https://nodejs.org/)** | Servidor web |
| **[Express](https://expressjs.com/)** | Framework web |
| **[Docker](https://www.docker.com/)** | Contenedorización |

## Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## Autor

**Ricardo Román Martínez**  
Trabajo Fin de Grado - Universidad Politécnica de Valencia (UPV)

---

<p align="center">
  <i>Desarrollado como parte del Trabajo Fin de Grado en la UPV</i>
</p>
