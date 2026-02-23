@echo off
set "HOST=localhost"
set "PORT=8889"
set "STREAM=whipLL"

wffmpeg -re ^
  -report ^
  -v debug ^
  -f lavfi -i testsrc=size=1280x720:rate=30 ^
  -f lavfi -i "sine=frequency=1000:sample_rate=48000" ^
  -c:v libx264 -pix_fmt yuv420p ^
  -preset ultrafast -b:v 600k -tune zerolatency -profile:v baseline -level 3.1 -g 60 -keyint_min 60 -bf 0 -x264-params "repeat-headers=1" ^
  -c:a libopus -ar 48000 -ac 2 -b:a 128k ^
  -handshake_timeout 5000 ^
  -f whip http://%HOST%:%PORT%/%STREAM%/whip
