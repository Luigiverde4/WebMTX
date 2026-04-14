@echo off
set "HOST=192.168.10.134"
set "PORT=8889"
set "STREAM=whipLL"

wffmpeg ^
-v debug ^
-report ^
-fflags +genpts+nobuffer+flush_packets ^
-flags low_delay ^
-f dshow ^
-rtbufsize 512M ^
-thread_queue_size 256 ^
-video_size 1920x1080 -framerate 30 -vcodec mjpeg ^
-i video="USB3.0 Video" ^
-f lavfi ^
-i anullsrc=r=48000:cl=stereo ^
-vf "scale=in_range=full:out_range=tv,format=yuv420p" ^
-c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline -level 3.1 ^
-x264-params "keyint=30:min-keyint=30:no-scenecut=1:ref=1:bframes=0:sliced-threads=1" ^
-g 30 -b:v 4000k -maxrate 4000k -bufsize 2000k ^
-c:a libopus -b:a 128k -ar 48000 -ac 2 ^
-async 1 ^
-application lowdelay -frame_duration 20 -packet_loss 15 -max_delay 0 ^
-fps_mode cfr -r 30 ^
-f whip ^
-buffer_size 512M ^
-pkt_size 1200 ^
https://%HOST%:%PORT%/%STREAM%/whip
