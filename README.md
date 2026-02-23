# TFG - Streaming WebRTC de Baja Latencia

Sistema de streaming de vídeo en tiempo real con latencia ultra-baja utilizando WebRTC, FFmpeg y MediaMTX.

## Descripción

Este proyecto implementa un sistema de transmisión de vídeo con baja latencia utilizando el protocolo WebRTC. Permite capturar vídeo desde diferentes fuentes (cámaras, pantalla, etc.) y transmitirlo a través de un servidor web con visualización en tiempo real.

## Arquitectura

```
┌─────────────┐     WHIP      ┌─────────────┐     WebRTC    ┌─────────────┐
│   FFmpeg    │ ────────────► │  MediaMTX   │ ◄───────────► │   Browser   │
│  (Emisor)   │               │  (Server)   │               │  (Player)   │
└─────────────┘               └─────────────┘               └─────────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │ Node.js Web │
                              │   Server    │
                              └─────────────┘
```

## Requisitos

- Docker y Docker Compose
- FFmpeg compilado con soporte WebRTC (para emisión)
- Python 3.x (opcional, para scripts de cámara)

## Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/TU_USUARIO/TFG-WebRTC-Streaming.git
cd TFG-WebRTC-Streaming
```

2. Levantar los servicios:
```bash
docker compose up --build
```

3. Acceder al reproductor:
   - Player: http://localhost/player.html
   - Control API: http://localhost/api-control.html

## Estructura del Proyecto

```
├── CAMS/                  # Scripts de captura y streaming
│   ├── WHIP/              # Scripts FFmpeg para WebRTC (WHIP)
│   ├── RTSP/              # Scripts para streaming RTSP
│   ├── SRT/               # Scripts para streaming SRT
│   └── PYWHIP/            # Scripts Python para streaming
├── server/                # Servidor web Node.js
│   ├── server.js          # Servidor Express + Socket.IO
│   └── public/            # Archivos estáticos (HTML/CSS/JS)
├── mediamtx/              # Configuración de MediaMTX
│   └── mediamtx.yml       # Configuración del servidor de medios
├── docker/                # Dockerfiles
├── rpi/                   # Scripts para Raspberry Pi
└── docs/                  # Documentación adicional
```

## Uso

### Iniciar streaming desde Windows (FFmpeg + WHIP)

```bash
cd CAMS/WHIP
.\webcam.bat
```

### Iniciar streaming desde Raspberry Pi

```bash
cd rpi
./stream_mjpeg_high.sh
```

## Puertos

| Puerto | Protocolo | Descripción |
|--------|-----------|-------------|
| 80     | HTTP      | Servidor web |
| 1935   | RTMP      | Streaming RTMP |
| 8554   | RTSP      | Streaming RTSP |
| 8888   | HTTP      | HLS |
| 8889   | HTTP      | WebRTC (WHIP/WHEP) |
| 8189   | UDP       | WebRTC ICE |
| 9997   | HTTP      | API MediaMTX |

## Tecnologías

- **MediaMTX**: Servidor de medios multi-protocolo
- **FFmpeg**: Codificación y transmisión de vídeo
- **WebRTC**: Comunicación en tiempo real
- **Node.js + Express**: Servidor web
- **Socket.IO**: Comunicación en tiempo real (WebSockets)
- **Docker**: Contenedorización

## Licencia

MIT License - Ver [LICENSE](LICENSE) para más detalles.

## Autor

Trabajo Fin de Grado - UPV
