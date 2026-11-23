#!/usr/bin/env python3
"""Join recorded words into sample calls, exactly as the app does (plan from clipPlan.ts), so they can be listened to.
  python3 scripts/make-voice-samples.py <out_dir> <plan.json> <voice> ...   (needs out_dir/words/<voice>/*.wav from make-voice-pack.py)
"""
import json, subprocess, sys, pathlib
import numpy as np, soundfile as sf
out = pathlib.Path(sys.argv[1]); plan = json.load(open(sys.argv[2]))
for vid in sys.argv[3:]:
    words = {}
    def w(k):
        if k not in words: words[k], sr = sf.read(out / 'words' / vid / f'{k}.wav', dtype='float32'); words['_sr'] = sr
        return words[k]
    chunks = []; sr = 24000
    for item in plan:
        for st in item['steps']:
            x = w(st['key']); sr = words['_sr']
            chunks.append(np.zeros(int(sr * st['pauseMs'] / 1000 / 1.0), dtype=np.float32)); chunks.append(x)
        chunks.append(np.zeros(int(sr * 1.6), dtype=np.float32))
    y = np.concatenate(chunks); wav = out / f'sample-{vid}.wav'; sf.write(wav, y, sr)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(wav),'-ac','1','-b:a','96k',str(out / f'sample-{vid}.mp3')], check=True); wav.unlink()
    print(vid, round(len(y) / sr, 1), 's')
