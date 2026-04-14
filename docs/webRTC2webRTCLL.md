# WebRTC a WebRTC Low Latency

---

## 🪟 WINDOWS (wffmpeg + DirectShow)

### 1. Con Webcam (Trust QHD Webcam)

**Multi-línea (legible):**
```bash
wffmpeg \
  -f dshow -rtbufsize 200M \
  -video_size 1920x1080 -framerate 25 \
  -i video="Trust QHD Webcam" \
  -f lavfi \
  -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency \
  -profile:v baseline -level 3.0 \
  -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" \
  -b:v 1800k -maxrate 1800k -bufsize 1800k \
  -pix_fmt yuv420p -shortest \
  -f whip https://192.168.0.120:8889/webcam/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -f dshow -rtbufsize 200M -video_size 1920x1080 -framerate 25 -i video="Trust QHD Webcam" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -level 3.0 -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" -b:v 1800k -maxrate 1800k -bufsize 1800k -pix_fmt yuv420p -shortest -f whip https://192.168.0.120:8889/webcam/whip
```

### 2. Con Webcam + Buffer

**Multi-línea (legible):**
```bash
wffmpeg \
  -f dshow -rtbufsize 200M \
  -video_size 1920x1080 -framerate 25 \
  -i video="Trust QHD Webcam" \
  -f lavfi \
  -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency \
  -profile:v baseline -level 3.0 \
  -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" \
  -b:v 1800k -maxrate 1800k -bufsize 1800k \
  -pix_fmt yuv420p -shortest -buffer_size 5M \
  -f whip https://192.168.0.120:8889/webcam/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -f dshow -rtbufsize 200M -video_size 1920x1080 -framerate 25 -i video="Trust QHD Webcam" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -level 3.0 -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" -b:v 1800k -maxrate 1800k -bufsize 1800k -pix_fmt yuv420p -shortest -buffer_size 5M -f whip https://192.168.0.120:8889/webcam/whip
```

### 3. Test Pattern (Sin Webcam) - Audio Mono

**Multi-línea (legible):**
```bash
wffmpeg \
  -re \
  -f lavfi -i testsrc=size=1280x720:rate=30 \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
  -c:v libx264 \
  -pix_fmt yuv420p -preset ultrafast \
  -b:v 600k \
  -c:a libopus \
  -ar 48000 -ac 2 -b:a 128k \
  -f whip https://192.168.0.120:8889/stream/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i "sine=frequency=1000:sample_rate=48000" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -b:v 600k -c:a libopus -ar 48000 -ac 2 -b:a 128k -f whip https://192.168.0.120:8889/stream/whip
```

### 4. Test Pattern - Alta Calidad + Zero Latency

**Multi-línea (legible):**
```bash
wffmpeg \
  -re \
  -f lavfi -i testsrc=size=1920x1080:duration=300:rate=25 \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency \
  -profile:v baseline -level 3.0 \
  -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" \
  -b:v 1800k -maxrate 1800k -bufsize 1800k \
  -pix_fmt yuv420p -shortest -buffer_size 5M \
  -f whip https://192.168.0.120:8889/stream/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -re -f lavfi -i testsrc=size=1920x1080:duration=300:rate=25 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -level 3.0 -x264-params "keyint=25:min-keyint=25:no-scenecut=1:ref=1:bframes=0" -b:v 1800k -maxrate 1800k -bufsize 1800k -pix_fmt yuv420p -shortest -buffer_size 5M -f whip https://192.168.0.120:8889/stream/whip
```

---

## 🐧 LINUX (wffmpeg + v4l2 + ALSA)

> ℹ️ **Notas**:
> - Usar `wffmpeg` (mismo ejecutable que Windows)
> - Dispositivos: `/dev/videoX` para video, `hw:X,Y` para audio
> - Listar: `v4l2-ctl --list-devices`

### 1. Test Pattern - Audio Mono

**Multi-línea (legible):**
```bash
wffmpeg \
  -re \
  -f lavfi -i testsrc=size=1280x720:rate=30 \
  -f lavfi -i "sine=frequency=1000:sample_rate=48000" \
  -c:v libx264 \
  -pix_fmt yuv420p -preset ultrafast \
  -b:v 600k \
  -c:a libopus \
  -ar 48000 -ac 2 -b:a 128k \
  -f whip https://192.168.0.120:8889/stream/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 -f lavfi -i "sine=frequency=1000:sample_rate=48000" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -b:v 600k -c:a libopus -ar 48000 -ac 2 -b:a 128k -f whip https://192.168.0.120:8889/stream/whip
```

### 2. Video HDMI + Audio → WHIP

**Multi-línea (legible):**
```bash
wffmpeg \
  -use_wallclock_as_timestamps 1 -fflags +genpts \
  -f v4l2 -input_format mjpeg \
  -video_size 1920x1080 -framerate 25 \
  -i /dev/video0 \
  -f alsa \
  -i hw:3,0 \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency \
  -c:a libopus -b:a 96k \
  -f whip https://192.168.0.120:8889/stream/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -use_wallclock_as_timestamps 1 -fflags +genpts -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 25 -i /dev/video0 -f alsa -i hw:3,0 -vf "scale=in_range=full:out_range=tv,format=yuv420p" -c:v libx264 -preset ultrafast -tune zerolatency -c:a libopus -b:a 96k -f whip https://192.168.0.120:8889/stream/whip
```

### 3. Video HDMI → WHIP (Sin Audio)

**Multi-línea (legible):**
```bash
wffmpeg \
  -use_wallclock_as_timestamps 1 -fflags +genpts \
  -f v4l2 -input_format mjpeg \
  -video_size 1920x1080 -framerate 25 \
  -i /dev/video0 \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency -an \
  -f whip https://192.168.0.120:8889/stream/whip
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -use_wallclock_as_timestamps 1 -fflags +genpts -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 25 -i /dev/video0 -vf "scale=in_range=full:out_range=tv,format=yuv420p" -c:v libx264 -preset ultrafast -tune zerolatency -an -f whip https://192.168.0.120:8889/stream/whip
```

### 4. Video + Audio HDMI → RTSP

**Multi-línea (legible):**
```bash
wffmpeg \
  -use_wallclock_as_timestamps 1 -fflags +genpts \
  -f v4l2 -input_format mjpeg \
  -video_size 1920x1080 -framerate 25 \
  -i /dev/video0 \
  -f alsa \
  -i hw:3,0 \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset ultrafast -tune zerolatency \
  -c:a libopus \
  -f rtsp rtsp://127.0.0.1:8554/cam
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -use_wallclock_as_timestamps 1 -fflags +genpts -f v4l2 -input_format mjpeg -video_size 1920x1080 -framerate 25 -i /dev/video0 -f alsa -i hw:3,0 -vf "scale=in_range=full:out_range=tv,format=yuv420p" -c:v libx264 -preset ultrafast -tune zerolatency -c:a libopus -f rtsp rtsp://127.0.0.1:8554/cam
```

### 5. Audio Pipe → Video → RTSP

**Multi-línea (legible):**
```bash
wffmpeg \
  -f alsa -i hw:3,0 \
  -f s16le -ar 48000 -ac 2 - | \
wffmpeg \
  -f v4l2 -input_format mjpeg \
  -i /dev/video0 \
  -f s16le -ar 48000 -ac 2 \
  -i pipe:0 \
  -c:v libx264 \
  -c:a libopus \
  -f rtsp rtsp://127.0.0.1:8554/cam
```

**Una línea (copiar-pegar):**
```bash
wffmpeg -f alsa -i hw:3,0 -f s16le -ar 48000 -ac 2 - | wffmpeg -f v4l2 -input_format mjpeg -i /dev/video0 -f s16le -ar 48000 -ac 2 -i pipe:0 -c:v libx264 -c:a libopus -f rtsp rtsp://127.0.0.1:8554/cam
```

---

## 📊 Diferencias Windows vs Linux

| Aspecto | Windows | Linux |
|---------|---------|-------|
| **Ejecutable** | `wffmpeg` | `wffmpeg` |
| **Captura Video** | `-f dshow` | `-f v4l2` |
| **Audio** | `anullsrc` / directshow | `alsa` con `hw:X,Y` |
| **Dispositivos** | Nombres (ej: "Trust QHD") | `/dev/videoX` |
| **Audio Device** | Nombre del dispositivo | `hw:card,device` |
| **Diferencia Principal** | DirectShow (dshow) | V4L2 (v4l2) |

---

## 🔧 Parámetros Clave

- `-preset ultrafast`: Máxima velocidad (mín. latencia)
- `-tune zerolatency`: Optimizado para baja latencia
- `-profile:v baseline`: Compatible WHIP
- `-level 3.0`: Restricción de nivel H.264
- `-b:v 1800k`: Bitrate video
- `-b:a 96k`: Bitrate audio
- `-pix_fmt yuv420p`: Formato pixel estándar
- `-shortest`: Termina con el stream más corto
