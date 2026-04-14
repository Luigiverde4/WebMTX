#!/bin/bash
# High Quality YUV422 Video (1920x1080, 10fps) - No Audio -> WHIP (MediaMTX)
# Raspberry Pi 4 - FFmpeg 8

awffmpeg \
  -use_wallclock_as_timestamps 1 \
  -fflags +genpts+nobuffer+flush_packets \
  -flags low_delay \
  -f v4l2 \
  -input_format yuyv422 \
  -video_size 1920x1080 \
  -framerate 10 \
  -i /dev/video0 \
  -f lavfi \
  -i anullsrc=r=48000:cl=stereo \
  -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 \
  -preset fast \
  -tune zerolatency \
  -profile:v main \
  -level 4.0 \
  -x264-params "keyint=10:min-keyint=10:no-scenecut=1:ref=2:bframes=0:sliced-threads=1" \
  -g 10 \
  -b:v 3000k -maxrate 3000k -bufsize 1500k \
  -c:a libopus \
  -b:a 128k -ar 48000 -ac 2 \
  -async 1 \
  -application lowdelay \
  -frame_duration 20 \
  -packet_loss 15 \
  -max_delay 0 \
  -fps_mode cfr -r 10 \
  -f whip https://192.168.0.120:8889/multi/whip
