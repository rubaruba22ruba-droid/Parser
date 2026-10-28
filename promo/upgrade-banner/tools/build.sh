#!/usr/bin/env bash
# Баннер «Апгрейд» Drade Drop, 11 с, 1080x1920, озвучка Silero v4 (ru).
# Нужно: demo-сборка casebot (node casebot/tools/demo.mjs <demo>), playwright, ffmpeg,
# python с torch + soundfile и модель https://models.silero.ai/models/tts/ru/v4_ru.pt
# ./build.sh <demo> <v4_ru.pt> <work>
set -euo pipefail
DEMO=$1 MODEL=$2 W=$3 H=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$W/frames" "$W/tts" "$W/out"
node "$H/record.js" "$DEMO" "$W/frames" 6          # seed 6: золото «?», приз Loot Bags ×14
python3 - "$W/frames" <<'PY'
import json, sys; d = sys.argv[1]; f = json.load(open(f'{d}/ts.json'))['frames']
L = ['ffconcat version 1.0']
for i, t in enumerate(f): L += [f"file '{i:05d}.jpg'", f'duration {(f[i+1]-t) if i+1 < len(f) else 0.03:.5f}']
open(f'{d}/list.txt', 'w').write('\n'.join(L) + '\n')
PY
ffmpeg -y -v error -f concat -safe 0 -i "$W/frames/list.txt" -vf "fps=60,format=yuv420p" -c:v libx264 -crf 14 "$W/raw.mp4"
ffmpeg -y -v error -ss 3.5 -i "$W/raw.mp4" -t 12.5 -an -vf "setpts=PTS/1.13636,fps=30,format=yuv420p" -t 11 -c:v libx264 -preset slow -crf 18 "$W/base.mp4"
python3 "$H/gen.py" "$MODEL" "$W/tts"
for v in aidar eugene baya kseniya xenia; do T=$W/tts/$v
  ffmpeg -y -v error -i "$W/base.mp4" -i "${T}_a.wav" -i "${T}_b.wav" -i "${T}_c.wav" -i "${T}_d.wav" -filter_complex \
    "[1]adelay=50:all=1[a];[2]adelay=2850:all=1[b];[3]adelay=5200:all=1[c];[4]adelay=9850:all=1[d];[a][b][c][d]amix=inputs=4:normalize=0,apad,atrim=0:11,loudnorm=I=-14:TP=-1.5:LRA=7,aresample=48000[au]" \
    -map 0:v -map "[au]" -c:v copy -c:a aac -b:a 192k -t 11 -movflags +faststart "$W/out/drade-drop-upgrade-$v.mp4"
done
