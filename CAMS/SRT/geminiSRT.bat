@echo off
set "HOST=localhost"
set "PORT=8890"
set "STREAM_ID=publish:srtLL"
set "LATENCY=200"
set "PKT_SIZE=1316"

ffmpeg ^
-v error ^
-f gdigrab -framerate 30 -offset_x -1920 -offset_y 0 -video_size 1920x1080 -i desktop ^
-f lavfi -i anullsrc=r=48000:cl=stereo ^
-vf "format=yuv420p" ^
-c:v libx264 -preset ultrafast -tune zerolatency -profile:v baseline ^
-x264-params "keyint=30:min-keyint=30:no-scenecut=1:ref=1:bframes=0:sliced-threads=0" ^
-b:v 4000k -maxrate 4000k -bufsize 2000k ^
-c:a libopus -b:a 96k -ac 2 ^
-f mpegts ^
"srt://%HOST%:%PORT%?streamid=%STREAM_ID%&latency=%LATENCY%&pkt_size=%PKT_SIZE%"