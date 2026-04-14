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
- **Interfaz web completa**: 
  - Broadcaster (emisor desde navegador)
  - Player (reproductor WebRTC en vivo)
  - Playback (reproductor de grabaciones)
  - **Statistics Dashboard** (monitoreo en tiempo real) 📊
  - **API Control Panel** (exploración y control de API REST) 🔧
- **Containerizado**: Despliegue sencillo con Docker Compose
- **API de control**: Gestión completa de streams mediante API HTTP REST v2
- **Arquitectura modular**: Componentes JS organizados por funcionalidad

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
6. **Control**: API REST v2 permite gestionar configuración, paths, grabaciones y sesiones

## Requisitos

### Para el servidor (Docker)
- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB RAM mínimo
- Puertos disponibles: 80, 443, 1935, 8554, 8888, 8889, 8189/UDP, 9997, 9996

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
| **Index** | https://localhost/ | Página principal con acceso a todas las herramientas |
| **Broadcaster** | https://localhost/broadcaster.html | Emitir stream desde el navegador (cámara/micrófono) |
| **Player** | https://localhost/player.html | Reproductor WebRTC principal con WHEP |
| **Playback** | https://localhost/playback.html | Reproductor de grabaciones con controles avanzados (fMP4) |
| **Statistics** | https://localhost/stats.html | Dashboard en tiempo real de estadísticas y métricas del servidor |
| **API Control** | https://localhost/api.html | Panel avanzado para explorar y controlar la API REST v2 |

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
│   ├── server.js              # Servidor Express (puertos 80/443 HTTP/HTTPS)
│   ├── modules/
│   │   └── app.js             # Configuración de rutas y proxies
│   └── public/                # Archivos estáticos
│       ├── index.html         # Página principal con enlaces
│       ├── broadcaster.html   # Emisor WHIP desde navegador
│       ├── player.html        # Reproductor WHEP (WebRTC en vivo)
│       ├── playback.html      # Reproductor de grabaciones (fMP4/HTTP)
│       ├── stats.html         # Dashboard de estadísticas en tiempo real 📊
│       ├── api.html           # Panel de control API REST v2 🔧
│       ├── css/               # Estilos CSS
│       └── js/                # Módulos JavaScript
│           ├── broadcaster.js      # Bootstrap broadcaster
│           ├── player.js           # Bootstrap player
│           ├── playback.js         # Bootstrap playback
│           ├── stats.js            # Bootstrap stats
│           ├── api/                # Módulos API
│           │   ├── api.js          # Cliente HTTP genérico
│           │   ├── api-config.js   # Endpoints de configuración
│           │   ├── api-paths.js    # Endpoints de paths/streams
│           │   ├── api-recordings.js # Endpoints de grabaciones
│           │   ├── api-sessions.js # Endpoints de sesiones
│           │   └── api-ui.js       # Helpers de UI para API
│           ├── ui/                 # Componentes UI
│           │   ├── broadcaster-ui.js # Selectores de dispositivos
│           │   ├── playback-ui.js    # Controles de reproducción
│           │   └── stats-ui.js       # Renderizado dashboard
│           └── utils/              # Funciones compartidas
│               ├── utils.js          # Utilidades generales (escapeHtml, formatBytes)
│               ├── watchdog.js       # Monitor de tráfico/estadísticas
│               ├── stats-charts.js   # Gráficos en tiempo real
│               ├── broadcast-utils.js # Helpers para broadcaster
│               └── playback-utils.js # Helpers para playback
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

### 🎥 Broadcaster - Emitir desde el navegador

El **Broadcaster** es la forma más sencilla de emitir streams sin instalar software. Funciona en cualquier dispositivo con navegador moderno (PC, móvil, tablet, Smart TV).

#### Características

- ✅ Sin instalación de software
- ✅ Soporte para cámaras y micrófonos del dispositivo
- ✅ Captura de pantalla (en navegadores soportados)
- ✅ Múltiples resoluciones para adaptarse a la red
- ✅ Protocolo WHIP nativo del navegador
- ✅ Ultra baja latencia (~100-300ms)

#### Cómo usar

**Desde el mismo equipo:**
1. Abrir https://localhost/broadcaster.html
2. Seleccionar cámara y micrófono a usar
3. Elegir resolución deseada (480p, 720p, 1080p)
4. Introducir nombre del endpoint (ej: `cam1`, `movil`, `pantalla`)
5. Hacer clic en **🔴 Iniciar Transmisión**
6. ✅ Stream visible inmediatamente en el Player

**Desde otro dispositivo en la red:**
1. Abrir `https://<IP_SERVIDOR>/broadcaster.html` (ej: https://192.168.1.100/broadcaster.html)
2. Mismo proceso que arriba
3. El stream es accesible por todos los dispositivos de la red

**Acceso seguro:**
- **localhost**: Funciona con HTTPS (https://localhost/broadcaster.html)
- **Por IP**: Requiere HTTPS obligatoriamente para acceder a cámara. Usa certificados mkcert:
  ```bash
  cd server
  mkcert localhost 127.0.0.1 192.168.X.X
  mv localhost+2.pem cert.pem && mv localhost+2-key.pem key.pem
  ```

#### Captura de pantalla

El Broadcaster también permite compartir la pantalla:
1. Hacer clic en **Capturar pantalla** en lugar de seleccionar cámara
2. Seleccionar ventana o pantalla a compartir
3. Iniciar transmisión

---

### FFmpeg - Streaming desde línea de comandos

Para automatización o emisión desde servidores sin interfaz gráfica:

**Streaming de prueba (Windows)**
```bash
cd CAMS/WHIP
.\test.bat
```
Envía un stream de prueba (testsrc + tono de audio) al servidor.

**Streaming desde webcam (Windows)**
```bash
cd CAMS/WHIP
.\webcam.bat
```

**Streaming desde Raspberry Pi**
```bash
cd rpi
chmod +x stream_mjpeg_high.sh
./stream_mjpeg_high.sh
```

---

### Reproducción de streams

#### Player WebRTC (Ultra baja latencia)

El reproductor utiliza el protocolo **WHEP** (WebRTC-HTTP Egress Protocol) para recibir el stream con ultra baja latencia.

**Desde el mismo equipo:**
1. Abrir https://localhost/player.html
2. Configurar el nombre del stream (por defecto: `whipLL`)
3. Hacer clic en **▶ Reproducir**

**Desde otro dispositivo en la red:**
1. Abrir `https://<IP_SERVIDOR>/player.html` (ej: https://192.168.1.100/player.html)
2. Configurar el servidor con la IP del equipo que ejecuta MediaMTX
3. Hacer clic en **▶ Reproducir**

**Acceso directo via WHEP (sin interfaz web):**
```
https://<IP_SERVIDOR>:8889/<nombre_stream>
```
Ejemplo: `https://192.168.1.100:8889/whipLL`

#### Playback - Reproductor de grabaciones

El reproductor de grabaciones permite visualizar vídeos grabados bajo demanda:

1. Abrir https://localhost/playback.html
2. Seleccionar un stream grabado de la lista
3. Elegir el punto de inicio o usar modo lookback
4. Pulsar **▶ Reproducir desde tiempo seleccionado**

**Características:**
- Búsqueda por fecha/hora
- Timeline interactivo
- Controles de reproducción (play/pausa/velocidad)
- Múltiples formatos (fMP4 via HTTPS)
- Acceso desde cualquier dispositivo en la red

> **Nota**: Playback no usa WebRTC. El navegador recibe fragmentos fMP4 vía HTTPS y los reproduce con el elemento `<video>`.

---

### 📊 Monitorizar estadísticas en tiempo real

El **Statistics Dashboard** permite visualizar métricas del servidor y los streams activos en tiempo real:

1. Abrir https://localhost/stats.html
2. El dashboard se actualiza automáticamente cada 1.5 segundos (configurable)
3. Visualiza:
   - Total de paths, paths listos y online
   - Readers/writers activos
   - Bytes recibidos/enviados
   - Gráficos de tráfico en tiempo real
   - Estado individual de cada stream

**Desde otro dispositivo:**
1. Abrir `https://<IP_SERVIDOR>/stats.html`
2. El dashboard funciona desde cualquier punto de la red

---

### 🔧 Explorar y controlar la API REST

El **API Control Panel** proporciona interface interactiva para:

1. Acceder a https://localhost/api.html
2. Explorar endpoints de la API REST v2 de MediaMTX:
   - **Config**: Recargar configuración, obtener información del servidor
   - **Paths**: Listar, crear, editar y eliminar paths
   - **Recordings**: Gestionar grabaciones
   - **Sessions**: Monitorizar sesiones de lectura/escritura
3. Ejecutar acciones directamente desde la interfaz
4. Ver respuestas en formato JSON

## Puertos y Protocolos

| Puerto | Protocolo | Descripción | Latencia |
|--------|-----------|-------------|----------|
| **80** | HTTP | Servidor web (redirige a HTTPS) | - |
| **443** | HTTPS | Servidor web seguro (requerido para getUserMedia por IP) | - |
| **1935** | RTMP | Streaming RTMP | ~2-5s |
| **8554** | RTSP | Streaming RTSP | ~1-2s |
| **8890** | UDP | SRT (Secure Reliable Transport) | ~200ms-2s |
| **8888** | HTTPS | HLS (HTTP Live Streaming) | ~6-30s |
| **8889** | HTTPS | WebRTC (WHIP/WHEP) | **~100-300ms** |
| **8189** | UDP | WebRTC ICE/STUN | - |
| **9997** | HTTPS | API REST MediaMTX | - |
| **9996** | HTTPS | Playback server (fMP4) | - |

## API MediaMTX

La API REST está disponible en el puerto 9997:

```bash
# Listar streams activos
curl https://localhost:9997/v3/paths/list

# Obtener información de un stream
curl https://localhost:9997/v3/paths/get/whipLL

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

### Arquitectura de módulos JavaScript

La interfaz web está organizada en una arquitectura modular y escalable:

```
js/
├── api/              # Capa API REST
│   ├── api.js        # Cliente HTTP genérico
│   ├── api-*.js      # Endpoints específicos (config, paths, recordings, sessions)
│   └── api-ui.js     # Helpers de UI para respuestas API
├── ui/               # Componentes de Interfaz
│   ├── *-ui.js       # Renderizado y controles UI
├── utils/            # Lógica compartida
│   ├── utils.js      # Utilidades generales
│   ├── watchdog.js   # Monitoreo de tráfico/WebRTC
│   ├── *-utils.js    # Helpers específicos por módulo
│   └── *-charts.js   # Visualizaciones
├── broadcaster.js    # Entry point broadcaster
├── player.js         # Entry point player
├── playback.js       # Entry point playback
└── stats.js          # Entry point stats
```

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
