@echo off
set "HOST=localhost"
set "PORT=8889"
set "STREAM=webcamLL"

wffmpeg ^
-v debug ^
-report ^
-fflags +genpts+nobuffer+flush_packets ^
-flags low_delay ^
-f dshow ^
-rtbufsize 512M ^
-thread_queue_size 256 ^
-framerate 30 ^
-video_size 1920x1080 ^
-i video="Trust QHD Webcam" ^
-f lavfi ^
-i anullsrc=r=48000:cl=stereo ^
-vf "scale=in_range=full:out_range=tv,format=yuv420p" ^
-c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -level 4.0 ^
-x264-params "keyint=30:min-keyint=30:no-scenecut=1:ref=1:bframes=0:sliced-threads=1" ^
-g 30 -b:v 2000k -maxrate 2000k -bufsize 4000k ^
-c:a libopus -b:a 128k -ar 48000 -ac 2 ^
-async 1 ^
-application lowdelay -frame_duration 20 -packet_loss 15 -max_delay 0 ^
-fps_mode cfr -r 30 ^
-f whip ^
https://%HOST%:%PORT%/%STREAM%/whip
