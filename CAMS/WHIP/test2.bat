@echo off
set "HOST=192.168.1.120"
set "PORT=8889"
set "STREAM=stream"

wffmpeg -v debug -re -f lavfi -i testsrc=size=1280x720:rate=30 ^
-f lavfi -i "sine=frequency=1000:sample_rate=48000" ^
-c:v libx264 -pix_fmt yuv420p -preset ultrafast -b:v 600k  ^
-preset ultrafast -b:v 600k -tune zerolatency -profile:v baseline -level 3.1 -g 60 -keyint_min 60 -bf 0 -x264-params "repeat-headers=1" ^
-c:a libopus -ar 48000 -ac 2 -b:a 128k ^
-handshake_timeout 20000 ^
-f whip https://%HOST%:%PORT%/%STREAM%/whip