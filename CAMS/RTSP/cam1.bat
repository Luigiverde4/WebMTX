@echo off
set "HOST=192.168.0.100"
set "PORT=8554"
set "STREAM=live/webcam"

ffmpeg -f dshow -video_size 640x480 -framerate 30 ^
-i video="Trust QHD Webcam" ^
-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 ^
-c:v libx264 ^
-preset ultrafast ^
-tune zerolatency ^
-profile:v baseline ^
-level 3.0 ^
-x264-params "keyint=30:min-keyint=30:no-scenecut=1:ref=1:bframes=0" ^
-c:a aac -ar 48000 -ac 2 ^
-shortest ^
-f rtsp -rtsp_transport tcp rtsp://%HOST%:%PORT%/%STREAM%
