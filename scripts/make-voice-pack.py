#!/usr/bin/env python3
"""Make the recorded co-driver voice packs (public/voices/<voice>.mp3 + .json).

Model: Kokoro-82M (Apache 2.0, commercial use allowed) through kokoro-onnx (MIT).
Needs: pip install kokoro-onnx soundfile lameenc numpy, ffmpeg on PATH, and the two model files from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 (kokoro-v1.0.int8.onnx, voices-v1.0.bin).

  python3 scripts/make-voice-pack.py <model_dir> <out_dir> [voice ...]

Each word is recorded alone, trimmed, loudness matched, then all words are joined into one sprite file
with a manifest of {word: [startSeconds, lengthSeconds]}. The app joins words into calls at run time.
"""
import json, subprocess, sys, pathlib
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# key in the manifest -> text the voice is asked to say
ONES = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
TENS = ['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
ORD = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth']
WORDS = {w: w for w in ['left','right','hairpin','square','kink','long','tightens','opens','tightening','opening','careful','caution','junction','sharp','medium','easy','slight','turn','ahead','into','and','then','in','feet','roundabout','exit','take','the','finish','arrive','merge','slow','down','go','is','on','sound','check','hundred','thousand','zero','stop','repeat']}
WORDS.update({'metres': 'meters', 'navi': 'Navi', 'u-turn': 'U turn', 'right-angle': 'right angle'})
WORDS.update({w: w for w in ONES + TENS})
WORDS.update({f'{i+1}{["st","nd","rd"][i] if i<3 else "th"}': ORD[i] for i in range(9)})

VOICES = {  # pack id -> (kokoro voice, language)
    'george': ('bm_george', 'en-gb'),
    'michael': ('am_michael', 'en-us'),
    'emma': ('bf_emma', 'en-gb'),
    'heart': ('af_heart', 'en-us'),
}

def rms_db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)

def tidy(x, sr):
    peak = np.max(np.abs(x)) + 1e-9
    keep = np.where(np.abs(x) > peak * 10 ** (-38 / 20))[0]
    a = max(0, keep[0] - int(0.010 * sr)); b = min(len(x), keep[-1] + int(0.030 * sr))
    x = x[a:b].copy()
    fi, fo = int(0.004 * sr), int(0.020 * sr)
    x[:fi] *= np.linspace(0, 1, fi); x[-fo:] *= np.linspace(1, 0, fo)
    x *= 10 ** ((-21 - rms_db(x)) / 20)
    p = np.max(np.abs(x))
    if p > 0.89: x *= 0.89 / p
    return x

def main():
    model_dir, out_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    ids = sys.argv[3:] or list(VOICES)
    out_dir.mkdir(parents=True, exist_ok=True)
    k = Kokoro(str(model_dir / 'kokoro-v1.0.int8.onnx'), str(model_dir / 'voices-v1.0.bin'))
    for vid in ids:
        voice, lang = VOICES[vid]
        gap = None; parts = []; man = {}; pos = 0.0; sr0 = None
        words_dir = out_dir / 'words' / vid; words_dir.mkdir(parents=True, exist_ok=True)
        for key, say in WORDS.items():
            x, sr = k.create(say, voice=voice, speed=1.08, lang=lang)
            x = tidy(np.asarray(x, dtype=np.float32), sr)
            sr0 = sr0 or sr
            sf.write(words_dir / f'{key}.wav', x, sr)
            if gap is None: gap = np.zeros(int(0.05 * sr), dtype=np.float32)
            man[key] = [round(pos, 4), round(len(x) / sr, 4)]
            parts += [x, gap]; pos += (len(x) + len(gap)) / sr
        sprite = np.concatenate(parts)
        wav = out_dir / f'{vid}.wav'; sf.write(wav, sprite, sr0)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '56k', str(out_dir / f'{vid}.mp3')], check=True)
        wav.unlink()
        (out_dir / f'{vid}.json').write_text(json.dumps({'voice': vid, 'clips': man}, separators=(',', ':')))
        print(vid, len(man), 'clips', round(pos, 1), 's', (out_dir / f'{vid}.mp3').stat().st_size // 1024, 'KB')

main()
