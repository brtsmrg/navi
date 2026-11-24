#!/usr/bin/env python3
"""Make the recorded co-driver voice packs (public/voices/<voice>.mp3 + .json).

Model: Kokoro-82M (Apache 2.0, commercial use allowed) through kokoro-onnx (MIT).
Needs: pip install kokoro-onnx soundfile lameenc numpy, ffmpeg on PATH, and the two model files from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 (kokoro-v1.0.int8.onnx, voices-v1.0.bin).

  python3 scripts/make-voice-pack.py <model_dir> <out_dir> [voice ...]

Whole phrases a co-driver says as one breath ("left three", "one fifty", "then in one hundred and ten
metres") are recorded as phrases so they keep natural rhythm; single words are recorded too, as a fallback.
Phrases that can be followed by more speech are recorded in a "continuing" voice; note phrases also get a
"final" take (key ends with a full stop) for when they end a call. Everything is trimmed, loudness matched
and joined into one sprite file with a manifest of {key: [startSeconds, lengthSeconds]}.
The app joins the clips into calls at run time (src/lib/clipPlan.ts).
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
WORDS.update({w: w for w in ORD})


def below100(n):
    if n < 20: return [ONES[n - 1]] if n else []
    return [TENS[n // 10 - 2]] + ([ONES[n % 10 - 1]] if n % 10 else [])

def number_words(n, plain):  # mirrors numberWords() in src/lib/clipPlan.ts
    out = []; th, rest = n // 1000, n % 1000
    if th:
        out += below100(th) + ['thousand']
        if not rest: return out
        if plain and rest < 100: out.append('and')
    h, rest = rest // 100, rest % 100
    if h:
        out += [ONES[h - 1], 'hundred']
        if rest and plain: out += ['and'] + below100(rest)
        elif rest: out += below100(rest)
    elif rest: out += below100(rest)
    if not plain and h and rest: out.remove('hundred')
    return out

GAPS = list(range(10, 150, 10)) + list(range(150, 400, 50)) + list(range(400, 3100, 100))
NUMS = ['one', 'two', 'three', 'four', 'five', 'six']
SIDES = ['left', 'right']
# (key, final take wanted). Keys are space-joined words, exactly what clipPlan.ts looks up.
PHRASES = []
def add(key, final=False): PHRASES.append((key, final))
for sd in SIDES:
    for n in NUMS: add(f'{sd} {n}', True)            # co-driver
    add(f'hairpin {sd}', True); add(f'square {sd}', True); add(f'{sd} kink', True)
    for w in ['sharp', 'medium', 'easy', 'slight']: add(f'{w} {sd}', True)  # plain English
    add(f'right-angle {sd}', True); add(f'exit {sd}', True)
for d in ['left', 'right', 'ahead']:
    for sh in ['', 'sharp ', 'slight ']:
        add(f'junction {sh}{d}', True); add(f'turn {sh}{d}', True)
for i in range(1, 10):
    add(f'roundabout exit {ONES[i - 1]}', True); add(f'take the {ORD[i - 1]} exit', True)
add('navi is on', True); add('sound check', True); add('slow down', True)
for g in GAPS:
    add(' '.join(number_words(g, False)))
    for lead in ['then in', 'in']: add(f'{lead} {" ".join(number_words(g, True))} metres')

def tts_text(key):
    return key.replace('metres', 'meters').replace('right-angle', 'right angle').replace('u-turn', 'U turn').replace('navi', 'Navi')

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
        jobs = [(k, t, '.') for k, t in WORDS.items()] + [(k, tts_text(k), ',') for k, _ in PHRASES]
        jobs += [(k + '.', tts_text(k), '.') for k, fin in PHRASES if fin]
        for key, say, tail in jobs:
            f = words_dir / f'{key}.wav'
            if f.exists():  # resume: a clip already recorded by an earlier, interrupted run
                x, sr = sf.read(f, dtype='float32')
            else:
                x, sr = k.create(say + tail, voice=voice, speed=1.18, lang=lang)
                x = tidy(np.asarray(x, dtype=np.float32), sr)
                sf.write(f, x, sr)
            sr0 = sr0 or sr
            if gap is None: gap = np.zeros(int(0.04 * sr), dtype=np.float32)
            man[key] = [round(pos, 4), round(len(x) / sr, 4)]
            parts += [x, gap]; pos += (len(x) + len(gap)) / sr
        sprite = np.concatenate(parts)
        wav = out_dir / f'{vid}.wav'; sf.write(wav, sprite, sr0)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '40k', str(out_dir / f'{vid}.mp3')], check=True)
        wav.unlink()
        (out_dir / f'{vid}.json').write_text(json.dumps({'voice': vid, 'clips': man}, separators=(',', ':')))
        print(vid, len(man), 'clips', round(pos, 1), 's', (out_dir / f'{vid}.mp3').stat().st_size // 1024, 'KB')

main()
