#!/bin/bash
# MJPEG Video + Sine Wave Audio -> WHIP (MediaMTX)
# Raspberry Pi 4 - FFmpeg 8

awffmpeg \
  -use_wallclock_as_timestamps 1 \
  -fflags +genpts+nobuffer+flush_packets \
  -flags low_delay \
  -f v4l2 \
  -input_format mjpeg \
  -video_size 1920x1080 \
  -framerate 25 \
  -i /dev/video0 \
  -f lavfi -i sine=frequency=1000:sample_rate=48000 \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -profile:v baseline \
  -level 3.1 \
  -x264-params "keyint=30:min-keyint=30:no-scenecut=1:ref=1:bframes=0:sliced-threads=1" \
  -g 30 \
  -b:v 1800k -maxrate 1800k -bufsize 900k \
  -c:a libopus \
  -b:a 96k -ar 48000 -ac 2 \
  -application lowdelay \
  -frame_duration 20 \
  -packet_loss 15 \
  -max_delay 0 \
  -f whip https://192.168.0.120:8889/multi/whip
