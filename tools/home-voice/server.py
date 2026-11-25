"""
Navi home voice: a small voice server for your own PC.

It speaks Navi's calls with Chatterbox (an open-source, MIT-licensed voice model) on your graphics card, and answers
in the same shape as OpenAI's speech service, so Navi's "Prepare voice" button can use it. Navi asks for every call on a
road ahead of the ride and keeps the audio on the phone, so driving needs no signal and the PC can be off.

Safety: it only answers a request that carries your private token (token.txt, made on first start), only allows the Navi
web page to call it (CORS), only accepts short texts, and is reached over HTTPS through a Cloudflare tunnel.
"""
import base64, hmac, io, json, os, re, secrets, sys, threading, time, wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FAKE = os.environ.get('NAVI_FAKE') == '1'  # tests without a graphics card: a tone instead of speech
PORT = int(os.environ.get('NAVI_PORT', '8808'))
ORIGINS = ['https://brtsmrg.github.io', 'http://localhost:4173', 'http://localhost:5173']
MAX_CHARS = 400

# how the voice is asked to sound: more "exaggeration" = more expressive; lower cfg = faster, less drawn out
SETTINGS_FILE = HERE / 'voice-settings.json'
DEFAULTS = {'exaggeration': 0.7, 'cfg_weight': 0.5, 'temperature': 0.7, 'pace': 1.0, 'bang': True, 'bright': 1.4, 'comp': 0.8, 'air': 0.12, 'reference': 'reference-sharp.wav', 'takes': 3, 'style_version': 4}


def settings() -> dict:
    s = dict(DEFAULTS)
    try:
        s.update(json.loads(SETTINGS_FILE.read_text(encoding='utf-8')))
    except Exception:
        pass
    return s


def get_token() -> str:
    f = HERE / 'token.txt'
    if f.exists() and f.read_text().strip():
        return f.read_text().strip()
    t = secrets.token_urlsafe(24)
    f.write_text(t)
    return t


TOKEN = get_token()
_lock = threading.Lock()
_model = None
SR = 24000


def load_model():
    global _model, SR
    if FAKE:
        return
    import torch
    from chatterbox.tts import ChatterboxTTS

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'Loading the voice model on {device} ...', flush=True)
    _model = ChatterboxTTS.from_pretrained(device=device)
    SR = _model.sr
    print(f'Voice model ready on {device}.', flush=True)


def prep_text(text: str, s: dict) -> str:
    t = re.sub(r'\s+', ' ', text).strip()
    if s['bang']:
        t = re.sub(r'\.$', '!', t)
    return t


def _biquad(kind: str, f0: float, gain_db: float, q: float, sr: int):
    """RBJ audio-EQ cookbook filter as one second-order section."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    else:  # high shelf
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return np.array([b[0] / a[0], b[1] / a[0], b[2] / a[0], 1.0, a[1] / a[0], a[2] / a[0]])


def _compress(a: np.ndarray, sr: int, amount: float) -> np.ndarray:
    """Gentle fast compressor: brings up the quiet consonants so words stay clear, like a broadcast voice chain."""
    if amount <= 0:
        return a
    thr = 10 ** (-26 / 20)
    ratio = 1 + 3.0 * amount
    att = np.exp(-1.0 / (0.001 * sr))
    rel = np.exp(-1.0 / (0.080 * sr))
    env = 0.0
    g = np.empty_like(a)
    x = np.abs(a)
    for i in range(a.size):
        v = x[i]
        env = att * env + (1 - att) * v if v > env else rel * env + (1 - rel) * v
        if env > thr:
            g[i] = (env / thr) ** (1 / ratio - 1)
        else:
            g[i] = 1.0
    return a * g


def sharpen(a: np.ndarray, sr: int, amount: float = 1.0, comp: float = 0.0, air: float = 0.0) -> np.ndarray:
    """Take the "far away / underwater" dullness out: cut rumble and mud, lift the consonants and air, even out the loudness."""
    from scipy import signal

    if amount <= 0 and comp <= 0 and air <= 0:
        return a
    x = a.astype(np.float64)
    if amount > 0:
        sos = [signal.butter(2, 75, 'highpass', fs=sr, output='sos')[0]]
        sos.append(_biquad('peak', 320, -2.0 * amount, 0.8, sr))
        sos.append(_biquad('peak', 3200, 4.0 * amount, 0.9, sr))
        sos.append(_biquad('peak', 5600, 3.0 * amount, 1.0, sr))
        sos.append(_biquad('shelf', 8000, 4.0 * amount, 0.7, sr))
        x = signal.sosfilt(np.vstack(sos), x)
    x = _compress(x, sr, comp)
    if air > 0:  # add faint harmonics above 4 kHz that the voice model leaves out
        hp = signal.butter(4, 4000, 'highpass', fs=sr, output='sos')
        x = x + air * signal.sosfilt(hp, np.tanh(x * 4.0) / 4.0)
    if comp > 0 or air > 0:  # loudness back up to a steady level, peaks caught by a look-ahead limiter (no clipping)
        from scipy.ndimage import maximum_filter1d, uniform_filter1d

        x = x * (0.16 / max(float(np.sqrt(np.mean(x ** 2))), 1e-6))
        w = max(3, int(0.004 * sr))
        pk = uniform_filter1d(maximum_filter1d(np.abs(x), w), w)
        x = x * np.minimum(1.0, 0.9 / np.maximum(pk, 1e-9))
        return x.astype(np.float32)
    out = np.tanh(x * 1.6 / max(float(np.max(np.abs(x))), 1e-4)) / np.tanh(1.6)  # soft limiter, no hard clipping
    return out.astype(np.float32)


def speech_segments(a: np.ndarray, sr: int, rel_db: float = -35.0, merge_s: float = 0.09):
    """Where the voice is actually speaking: (start, end, peak in dB below the loudest part), short gaps joined."""
    from scipy.ndimage import uniform_filter1d

    env = np.sqrt(np.maximum(uniform_filter1d(a.astype(np.float64) ** 2, max(3, int(0.01 * sr))), 0.0))
    top = float(env.max())
    if top < 1e-6:
        return []
    on = env > top * 10 ** (rel_db / 20)
    edges = np.flatnonzero(np.diff(np.concatenate(([0], on.astype(np.int8), [0]))))
    runs = [[int(edges[i]), int(edges[i + 1])] for i in range(0, len(edges), 2)]
    merged = []
    for r in runs:
        if merged and (r[0] - merged[-1][1]) / sr < merge_s:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return [(s0, s1, 20 * np.log10(max(float(env[s0:s1].max()), 1e-9) / top)) for s0, s1 in merged]


def drop_junk_edges(a: np.ndarray, sr: int):
    """Voice models sometimes add a faint blip, breath or half-word after the last real word (short calls most of all).
    Cut any quiet, short burst at the end (or start) that stands apart from the speech. Returns (audio, ms removed)."""
    segs = speech_segments(a, sr)
    if len(segs) < 2:
        return a, 0
    lo, hi = 0, len(segs)
    while hi - lo > 1:
        s0, s1, db = segs[hi - 1]
        dur = (s1 - s0) / sr
        gap = (s0 - segs[hi - 2][1]) / sr
        if (db < -14 and dur < 0.45 and gap > 0.06) or dur < 0.10:
            hi -= 1
        else:
            break
    while hi - lo > 1:
        s0, s1, db = segs[lo]
        dur = (s1 - s0) / sr
        gap = (segs[lo + 1][0] - s1) / sr
        if (db < -14 and dur < 0.30 and gap > 0.06) or dur < 0.06:
            lo += 1
        else:
            break
    start, end = segs[lo][0], segs[hi - 1][1]
    removed = (sum(e - b for b, e, _ in segs[:lo]) + sum(e - b for b, e, _ in segs[hi:])) / sr * 1000
    pad = int(sr * 0.03)
    return a[max(0, start - pad): min(a.size, end + pad)], int(round(removed))


def finish(a: np.ndarray, pace: float, bright: float = 1.0, comp: float = 0.0, air: float = 0.0):
    """Cut junk off both ends (judged on the raw voice, before the compressor lifts quiet sounds), sharpen, even loudness,
    soft edges. Returns (audio, ms of junk removed). (No time stretching: it made the voice sound underwater.)"""
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    if a.size == 0:
        return a, 0
    if float(np.max(np.abs(a))) < 1e-4:
        return a, 0
    a, junk_ms = drop_junk_edges(a, SR)
    a = sharpen(a, SR, bright, comp, air)
    peak = float(np.max(np.abs(a)))
    if peak < 1e-4:
        return a, junk_ms
    floor = peak * 0.03
    idx = np.where(np.abs(a) > floor)[0]
    pad = int(SR * 0.03)
    a = a[max(0, idx[0] - pad): min(a.size, idx[-1] + pad)]
    a = a * (0.92 / max(float(np.max(np.abs(a))), 1e-4))
    fade = min(a.size // 2, int(SR * 0.012))
    if fade:
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        a[:fade] *= ramp
        a[-fade:] *= ramp[::-1]
    return a, junk_ms


def words_in(text: str) -> int:
    return max(1, len(re.findall(r"[A-Za-z0-9]+", text)))


def take_ok(dur: float, words: int) -> bool:
    """A take is believable when its length fits the number of words (too short = cut off, too long = rambling)."""
    return 0.18 * words + 0.2 <= dur <= 0.62 * words + 0.9


LAST = {}  # what the last call did, for the logs and the sample maker


def synth(text: str) -> bytes:
    s = settings()
    t = prep_text(text, s)
    words = words_in(t)
    takes = max(1, int(s.get('takes', 3)))
    best = None  # (score, audio, info)
    with _lock:
        for k in range(takes):
            if FAKE:
                n = int(SR * (0.25 + 0.06 * len(t)))
                tt = np.arange(n) / SR
                raw = (0.3 * np.sin(2 * np.pi * 220 * tt)).astype(np.float32)
            else:
                import torch

                ref = HERE / s['reference'] if s['reference'] != 'none' else None
                kw = dict(exaggeration=s['exaggeration'], cfg_weight=s['cfg_weight'], temperature=s['temperature'])
                if ref is not None and ref.exists():
                    kw['audio_prompt_path'] = str(ref)
                torch.manual_seed(1000 + k)
                with torch.inference_mode():
                    wav = _model.generate(t, **kw)
                raw = wav.squeeze().detach().cpu().numpy()
            a, junk_ms = finish(raw, s['pace'], s['bright'], s['comp'], s['air'])
            dur = a.size / SR
            ok = take_ok(dur, words)
            # lower is better: believable length first, then nothing cut, then the shortest (fewest odd pauses)
            score = (0 if ok else 1, 1 if junk_ms > 0 else 0, dur)
            info = {'take': k + 1, 'of': takes, 'dur': round(dur, 2), 'junk_ms': junk_ms, 'ok': ok}
            if best is None or score < best[0]:
                best = (score, a, info)
            if ok and junk_ms == 0:
                break  # a clean take: no need to try again
    LAST.clear()
    LAST.update(best[2])
    print(f"voice '{t[:40]}' -> take {best[2]['take']}/{best[2]['of']}, {best[2]['dur']}s, junk cut {best[2]['junk_ms']} ms, ok={best[2]['ok']}", flush=True)
    a = best[1]
    pcm = (np.clip(a, -1, 1) * 32767).astype('<i2')
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def make_app():
    from fastapi import FastAPI, Header, HTTPException, Response
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['GET', 'POST', 'OPTIONS'], allow_headers=['authorization', 'content-type'], max_age=600)

    class Speech(BaseModel):
        input: str
        model: str | None = None
        voice: str | None = None
        instructions: str | None = None
        response_format: str | None = None

    @app.get('/health')
    def health():
        return {'ok': True, 'model': 'chatterbox', 'style_version': settings()['style_version'], 'ready': FAKE or _model is not None}

    @app.post('/v1/audio/speech')
    def speech(body: Speech, authorization: str = Header(default='')):
        if not hmac.compare_digest(authorization.strip(), f'Bearer {TOKEN}'):
            raise HTTPException(status_code=401, detail='bad token')
        text = body.input.strip()
        if not text or len(text) > MAX_CHARS:
            raise HTTPException(status_code=400, detail='text length')
        if not FAKE and _model is None:
            raise HTTPException(status_code=503, detail='model loading')
        return Response(content=synth(text), media_type='audio/wav', headers={'Cache-Control': 'no-store'})

    return app


if __name__ == '__main__':
    import uvicorn

    load_model()
    uvicorn.run(make_app(), host='127.0.0.1', port=PORT, log_level='warning')
