# Guía Completa: Compilación de FFmpeg con WebRTC (WHIP)

Esta guía documenta el proceso completo de compilación de FFmpeg con soporte WebRTC (protocolo WHIP) para **Windows** y **Linux**, y su integración con el servidor MediaMTX para streaming de baja latencia.

---

## Tabla de Contenidos

1. [Compilación en Linux](#1-compilación-en-linux-raspberry-pi--debian--ubuntu)
2. [Compilación en Windows](#2-compilación-en-windows)
3. [Configuración del Servidor MediaMTX](#3-configuración-del-servidor-mediamtx)
4. [Comandos de Streaming](#4-comandos-de-streaming)
5. [Comparativa Windows vs Linux](#5-comparativa-windows-vs-linux)
6. [Resumen de Puertos y Protocolos](#6-resumen-de-puertos-y-protocolos)
7. [Notas Técnicas](#7-notas-técnicas)
8. [Troubleshooting y Debugging](#8-troubleshooting-y-debugging)

---

## 1. Compilación en Linux (Raspberry Pi / Debian / Ubuntu)

### 1.1 Instalación de Dependencias

```bash
sudo apt update
sudo apt install -y \
  build-essential pkg-config git \
  libssl-dev libsrtp2-dev libusrsctp-dev \
  libopus-dev libx264-dev
```

### 1.2 Verificación (Opcional)

Comprobar que las librerías clave están instaladas:

```bash
pkg-config --modversion srtp2
pkg-config --modversion usrsctp
```

### 1.3 Clonar el Repositorio

```bash
git clone https://github.com/ossrs/ffmpeg-webrtc.git
cd ffmpeg-webrtc
```

### 1.4 Configuración

```bash
./configure \
  --enable-gpl \
  --enable-openssl \
  --enable-libopus \
  --enable-libx264 \
  --enable-nonfree
```

**Nota:** El soporte WHIP se habilita automáticamente si están disponibles OpenSSL, libsrtp2 y usrsctp.

### 1.5 Compilación

```bash
# En sistemas con suficiente RAM
make -j$(nproc)

# En Raspberry Pi o sistemas con poca RAM
make -j2
```

### 1.6 Instalación

```bash
sudo make install
```

El binario se instala en `/usr/local/bin/ffmpeg`

### 1.7 Verificación de WHIP

```bash
/usr/local/bin/ffmpeg -formats | grep whip
```

**Resultado esperado:**
```
E whip
```

---

## 2. Compilación en Windows

FFmpeg no incluye soporte WebRTC en las versiones precompiladas. Es necesario compilarlo manualmente usando MSYS2.

### 2.1 Preparación del Sistema

1. **Instalar MSYS2** desde [https://www.msys2.org/](https://www.msys2.org/)

2. **Abrir el terminal UCRT64** (no usar el terminal MSYS2 normal)

3. **Instalar herramientas y librerías necesarias:**

```bash
pacman -S mingw-w64-ucrt-x86_64-toolchain \
          mingw-w64-ucrt-x86_64-openssl \
          mingw-w64-ucrt-x86_64-libx264 \
          mingw-w64-ucrt-x86_64-libopus
```

### 2.2 Clonar el Repositorio

```bash
git clone https://github.com/ossrs/ffmpeg-webrtc.git
cd ffmpeg-webrtc
```

### 2.3 Configuración

```bash
./configure --prefix=$MINGW_PREFIX \
            --enable-gpl \
            --enable-version3 \
            --enable-libx264 \
            --enable-libopus \
            --enable-openssl \
            --enable-indev=dshow \
            --disable-doc
```

**Nota:** El flag `--enable-indev=dshow` es específico de Windows para captura de dispositivos DirectShow (webcams).

### 2.4 Compilación

```bash
make -j$(nproc)
```

### 2.5 Portabilidad (DLLs)

Para ejecutar el binario fuera de MSYS2, copiar las DLLs necesarias al directorio del ejecutable:

```bash
cp /ucrt64/bin/*.dll .
```

---

## 3. Configuración del Servidor (MediaMTX)

### 3.1 Parámetros Críticos en `mediamtx.yml`

**Puertos:**
- `8889`: Control y negociación HTTP/WHIP
- `8189`: Datos de vídeo UDP listener

**Configuración de Red:**
- `webrtcIPsFromInterfaces: yes` - Permite la detección automática de la IP del servidor
- `webrtcAdditionalHosts: []` - **IMPORTANTE**: Dejar vacío si el servidor está en LAN local. Solo agregar IPs si:
  - El servidor tiene una IP pública (NAT) que los clientes deben conocer
  - El servidor tiene múltiples interfaces de red y la detección automática falla
  - ⚠️ **NO poner aquí la IP del cliente**, solo del servidor

### 3.2 Firewall

**Windows:**
- **8889/TCP** - HTTP/WHIP
- **8189/UDP** - WebRTC data

**Linux:**
```bash
sudo ufw allow 8889/tcp
sudo ufw allow 8189/udp
```

---

## 4. Comandos de Streaming

### 4.1 Linux - Cámara V4L2

```bash
ffmpeg \
  -f v4l2 -i /dev/video0 \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -pix_fmt yuv420p \
  -f whip https://192.168.1.120:8889/cam/whip
```

### 4.2 Linux - Test Pattern

```bash
ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \
       -c:v libx264 -preset ultrafast -tune zerolatency \
       -pix_fmt yuv420p -an \
      -f whip https://192.168.1.120:8889/test/whip
```

### 4.3 Windows - Webcam DirectShow

```bash
./ffmpeg -f dshow -rtbufsize 200M -video_size 1920x1080 -framerate 25 \
         -i video="Trust QHD Webcam" \
         -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
         -c:v libx264 -preset ultrafast -tune zerolatency \
         -profile:v baseline -level 3.0 \
         -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" \
         -b:v 1800k -maxrate 1800k -bufsize 1800k \
         -pix_fmt yuv420p -shortest \
         -f whip https://192.168.1.120:8889/webcam/whip
```

### 4.4 Windows - Test Pattern

```bash
./ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \
         -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
         -c:v libx264 -pix_fmt yuv420p -preset ultrafast \
         -b:v 600k -c:a libopus -ar 48000 -ac 2 -b:a 128k \
         -f whip https://192.168.1.120:8889/test/whip
```

---

## 5. Comparativa Windows vs Linux

| Aspecto | Linux | Windows |
|---------|-------|---------|  
| **Configuración** | Directa y estándar | Requiere MSYS2/MINGW |
| **Herramientas** | Nativas Unix | Emulación en MSYS2 |
| **Estabilidad** | Alta | Media |
| **Portabilidad** | Binario estático posible | Requiere DLLs |
| **Captura de vídeo** | V4L2 (`/dev/video0`) | DirectShow (`dshow`) |
| **Uso en producción** | ✅ Recomendado | ⚠️ Desarrollo/pruebas |
| **Raspberry Pi** | ✅ Nativo | ❌ No aplicable |

### Recomendación para el TFG

- **Linux (Raspberry Pi)**: Entorno principal de producción
- **Windows**: Desarrollo y pruebas locales
- **MediaMTX**: Servidor centralizado de distribución
- **WHIP/WebRTC**: Protocolo de ingest de baja latencia

---

## 6. Resumen de Puertos y Protocolos

| Protocolo | Puerto | Tipo | Descripción                |
|-----------|--------|------|----------------------------|
| RTSP      | 8554   | TCP  | Streaming tradicional      |
| RTMP      | 1935   | TCP  | Flash Media Server         |
| HLS       | 8888   | TCP  | HTTP Live Streaming        |
| WebRTC    | 8889   | TCP  | HTTP/WHIP señalización     |
| WebRTC    | 8189   | UDP  | WebRTC datos multimedia    |

---

## 7. Notas Técnicas

### Parámetros de Codificación

- **`preset ultrafast`**: Minimiza la latencia de codificación
- **`tune zerolatency`**: Optimiza para streaming en tiempo real
- **`keyint=25`**: Con framerate 25, genera un I-frame por segundo
- **`no-scenecut=1`**: Asegura keyframes regulares independientemente del contenido
- **`bframes=0`**: Elimina B-frames para reducir latencia
- **`profile:v baseline`**: Máxima compatibilidad con decodificadores

### Captura de Dispositivos

**Linux (V4L2):**
```bash
# Listar dispositivos disponibles
v4l2-ctl --list-devices

# Ver formatos soportados
v4l2-ctl --device=/dev/video0 --list-formats-ext
```

**Windows (DirectShow):**
```bash
# Listar dispositivos disponibles
./ffmpeg -list_devices true -f dshow -i dummy
```

---

## 8. Troubleshooting y Debugging

### 8.1 Monitorización de Tráfico WebRTC/UDP

**Linux - Captura de tráfico UDP:**
```bash
# Monitorizar tráfico UDP hacia/desde el servidor MediaMTX
sudo tcpdump -i eth0 'udp and host 192.168.1.48' -n

# Con más detalles (payload hexadecimal)
sudo tcpdump -i eth0 'udp and host 192.168.1.48' -n -X

# Guardar captura para análisis posterior
sudo tcpdump -i eth0 'udp and host 192.168.1.48' -n -w webrtc_capture.pcap
```

**Filtros específicos:**
```bash
# Solo puertos WebRTC (8189)
sudo tcpdump -i eth0 'udp and port 8189' -n

# Tráfico HTTP/WHIP (señalización)
sudo tcpdump -i eth0 'tcp and port 8889' -n
```

### 8.2 Verificación de Puertos

**Linux:**
```bash
# Verificar que MediaMTX está escuchando
sudo netstat -tulpn | grep mediamtx

# O con ss (alternativa moderna)
sudo ss -tulpn | grep mediamtx

# Verificar conectividad desde cliente
nc -zv 192.168.1.120 8889  # TCP/WHIP
nc -zvu 192.168.1.120 8189 # UDP/WebRTC
```

**Windows:**
```powershell
# Verificar puertos en escucha
netstat -an | Select-String "8889|8189"

# Verificar conectividad
Test-NetConnection -ComputerName 192.168.1.120 -Port 8889
```

### 8.3 Logs de MediaMTX

**Habilitar logs verbosos en `mediamtx.yml`:**
```yaml
logLevel: debug
```

**Monitorizar logs en tiempo real:**
```bash
# Linux
tail -f /var/log/mediamtx.log

# Si se ejecuta en terminal
./mediamtx  # Los logs aparecen directamente en stdout
```

### 8.4 Diagnóstico de FFmpeg

**Aumentar verbosidad:**
```bash
# Nivel de log detallado
ffmpeg -loglevel debug -re -f lavfi -i testsrc [...resto del comando...]

# Nivel de log extremo (para debugging profundo)
ffmpeg -loglevel trace [...resto del comando...]
```

**Verificar codecs disponibles:**
```bash
# Verificar soporte WHIP
ffmpeg -formats | grep whip

# Verificar codecs de vídeo
ffmpeg -codecs | grep 264

# Verificar codecs de audio
ffmpeg -codecs | grep opus
```

### 8.5 Problemas Comunes

**Error: "Connection refused" en WHIP**
- Verificar que MediaMTX está ejecutándose
- Comprobar que el puerto 8889 está abierto en el firewall
- Verificar la IP del servidor es correcta

**No hay tráfico UDP (8189)**
- Verificar que `webrtcIPsFromInterfaces: yes` está configurado
- Comprobar que el puerto 8189/UDP está abierto
- Usar tcpdump para verificar si hay paquetes llegando

**Alta latencia o buffering**
- Reducir `bufsize` en FFmpeg
- Usar `tune zerolatency`
- Verificar ancho de banda de red con `iperf3`

**FFmpeg no encuentra el dispositivo de captura**

*Linux:*
```bash
# Verificar permisos del dispositivo
ls -l /dev/video0
sudo usermod -aG video $USER  # Agregar usuario al grupo video
```

*Windows:*
```bash
# Listar dispositivos exactos
./ffmpeg -list_devices true -f dshow -i dummy 2>&1 | Select-String "video"
```

### 8.6 Herramientas Adicionales

**Wireshark** (análisis detallado de tráfico):
- Filtro para WebRTC: `udp.port == 8189`
- Filtro para WHIP: `tcp.port == 8889 && http`

**iperf3** (prueba de ancho de banda):
```bash
# Servidor
iperf3 -s

# Cliente
iperf3 -c 192.168.1.120 -t 30
```

**VLC** (reproducción de prueba):
```bash
# Reproducir stream RTSP desde MediaMTX
vlc rtsp://192.168.1.120:8554/webcam
```