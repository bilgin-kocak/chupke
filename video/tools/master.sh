#!/bin/sh
# Brings the rendered film to streaming loudness (about -14 LUFS, true peak under -1 dBTP): out/chupke-raw.mp4 -> out/chupke.mp4
set -e
ffmpeg -v error -y -i out/chupke-raw.mp4 -map 0:v -map 0:a -c:v copy -af "volume=8.3dB,alimiter=limit=0.74:attack=2:release=80:level=0" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart out/chupke.mp4
