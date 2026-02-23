@echo off
set "HOST=localhost"
set "PORT=8889"
set "STREAM=multi"

wffmpeg ^
-v debug ^
-report ^
-fflags +genpts+nobuffer+flush_packets ^
-flags low_delay ^
-f dshow ^
-rtbufsize 512M ^
-thread_queue_size 256 ^
-video_size 1920x1080 -framerate 10 -pixel_format yuyv422 ^
-i video="USB3.0 Video" ^
-f lavfi ^
-i anullsrc=r=48000:cl=stereo ^
-vf "scale=in_range=full:out_range=tv,format=yuv420p" ^
-c:v libx264 -preset fast -tune zerolatency -profile:v main -level 4.0 ^
-x264-params "keyint=10:min-keyint=10:no-scenecut=1:ref=2:bframes=0:sliced-threads=1" ^
-g 10 -b:v 3000k -maxrate 3000k -bufsize 1500k ^
-c:a libopus -b:a 128k -ar 48000 -ac 2 ^
-async 1 ^
-application lowdelay -frame_duration 20 -packet_loss 15 -max_delay 0 ^
-fps_mode cfr -r 10 ^
-f whip ^
http://%HOST%:%PORT%/%STREAM%/whip
