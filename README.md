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

## Arquitectura

```
┌─────────────────┐                    ┌─────────────────┐                    ┌─────────────────┐
│     FUENTES     │                    │    SERVIDOR     │                    │    CLIENTES     │
├─────────────────┤                    ├─────────────────┤                    ├─────────────────┤
│                 │       WHIP         │                 │      WebRTC       │                 │
│  FFmpeg (Win)   │ ─────────────────► │                 │ ◄───────────────► │    Browser      │
│                 │                    │                 │                   │   (player.html) │
│  FFmpeg (RPi)   │ ─────────────────► │    MediaMTX     │                   │                 │
│                 │                    │   (Puerto 8889) │                   │                 │
│  Python/PYWHIP  │ ─────────────────► │                 │                   │                 │
│                 │                    │                 │                   │                 │
└─────────────────┘                    │       ▲         │                   └─────────────────┘
                                       │       │         │                             
                                       │       ▼         │                             
                                       │  ┌───────────┐  │                             
                                       │  │  Node.js  │  │◄────── http://localhost:80                       
                                       │  │  Server   │  │                             
                                       │  └───────────┘  │                             
                                       └─────────────────┘                             
```

### Flujo de datos

1. **Emisión (WHIP)**: FFmpeg captura y codifica el vídeo, enviándolo al servidor MediaMTX mediante protocolo WHIP
2. **Servidor (MediaMTX)**: Recibe los streams y los redistribuye a los clientes conectados
3. **Reproducción (WHEP)**: Los navegadores se conectan mediante WebRTC para visualización en tiempo real

## Requisitos

### Para el servidor (Docker)
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM mínimo
- Puertos disponibles: 80, 1935, 8554, 8888, 8889, 8189/UDP, 9997

### Para emisión desde Windows
- FFmpeg compilado con soporte WebRTC/WHIP (ver `/docs/compilacion_todo_junto.md`)
- Cámara USB o capturadora compatible

### Para emisión desde Raspberry Pi
- Raspberry Pi 4 (recomendado)
- FFmpeg compilado con soporte WebRTC/WHIP (ver `/docs/compilacion_ffmpeg_webrtc.md`)
- Cámara USB o módulo de cámara Pi

### Opcional
- Python 3.8+ (para scripts PYWHIP)

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/Luigiverde4/TFG.git
cd TFG
```

### 2. Configurar MediaMTX (IMPORTANTE)

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

### 3. Levantar los servicios

```bash
docker compose up --build
```

Para ejecutar en segundo plano:
```bash
docker compose up -d --build
```

### 4. Verificar funcionamiento

Acceder a las interfaces web:

| Interfaz | URL | Descripción |
|----------|-----|-------------|
| **Player** | http://localhost/player.html | Reproductor WebRTC principal |
| **Playback** | http://localhost/playback.html | Reproductor con controles avanzados |
| **API Control** | http://localhost/api-control.html | Panel de control de la API |

## Estructura del Proyecto

```
TFG/
├── CAMS/                      # Scripts de captura y streaming
│   ├── WHIP/                  # Scripts FFmpeg para WebRTC (Windows)
│   │   ├── test.bat           # Stream de prueba (testsrc)
│   │   ├── webcam.bat         # Stream desde webcam
│   │   └── multi_*.bat        # Configuraciones multi-cámara
│   ├── RTSP/                  # Scripts para streaming RTSP
│   ├── SRT/                   # Scripts para streaming SRT
│   └── PYWHIP/                # Scripts Python para streaming
│       ├── pywhip.py          # Emisor WHIP en Python
│       └── pywhip_screen.py   # Captura de pantalla
├── server/                    # Servidor web Node.js
│   ├── server.js              # Servidor Express (puerto 80)
│   └── public/                # Archivos estáticos
│       ├── player.html        # Reproductor principal
│       ├── playback.html      # Reproductor avanzado
│       ├── api-control.html   # Control de API
│       ├── js/                # Scripts JavaScript
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
│   └── multi_*.sh             # Configuraciones multi-stream
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
http://<IP_SERVIDOR>:8889/<nombre_stream>/whep
```
Ejemplo: `http://192.168.1.100:8889/whipLL/whep`

## Puertos y Protocolos

| Puerto | Protocolo | Descripción | Latencia |
|--------|-----------|-------------|----------|
| **80** | HTTP | Servidor web (interfaz) | - |
| **1935** | RTMP | Streaming RTMP | ~2-5s |
| **8554** | RTSP | Streaming RTSP | ~1-2s |
| **8888** | HTTP | HLS (HTTP Live Streaming) | ~6-30s |
| **8889** | HTTP | WebRTC (WHIP/WHEP) | **~100-300ms** |
| **8189** | UDP | WebRTC ICE/STUN | - |
| **9997** | HTTP | API REST MediaMTX | - |

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
| **[Socket.IO](https://socket.io/)** | Comunicación WebSocket |
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
