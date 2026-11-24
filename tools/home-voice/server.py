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
DEFAULTS = {'exaggeration': 0.55, 'cfg_weight': 0.5, 'temperature': 0.7, 'pace': 1.0, 'bang': True, 'bright': 1.0, 'reference': 'reference.wav', 'style_version': 2}


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


def sharpen(a: np.ndarray, sr: int, amount: float = 1.0) -> np.ndarray:
    """Take the "far away / underwater" dullness out: cut rumble and mud, lift the consonants and air, tame the peaks."""
    from scipy import signal

    if amount <= 0:
        return a
    sos = [signal.butter(2, 75, 'highpass', fs=sr, output='sos')[0]]
    sos.append(_biquad('peak', 320, -2.0 * amount, 0.8, sr))
    sos.append(_biquad('peak', 3200, 4.0 * amount, 0.9, sr))
    sos.append(_biquad('peak', 5600, 3.0 * amount, 1.0, sr))
    sos.append(_biquad('shelf', 8000, 4.0 * amount, 0.7, sr))
    out = signal.sosfilt(np.vstack(sos), a.astype(np.float64))
    out = np.tanh(out * 1.6 / max(float(np.max(np.abs(out))), 1e-4)) / np.tanh(1.6)  # soft limiter, no hard clipping
    return out.astype(np.float32)


def finish(a: np.ndarray, pace: float, bright: float = 1.0) -> np.ndarray:
    """Cut the silence off both ends, sharpen, even loudness, soft edges. (No time stretching: it made the voice sound underwater.)"""
    a = np.asarray(a, dtype=np.float32).reshape(-1)
    if a.size == 0:
        return a
    a = sharpen(a, SR, bright)
    peak = float(np.max(np.abs(a)))
    if peak < 1e-4:
        return a
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
    return a


def synth(text: str) -> bytes:
    s = settings()
    t = prep_text(text, s)
    with _lock:
        if FAKE:
            n = int(SR * (0.25 + 0.06 * len(t)))
            tt = np.arange(n) / SR
            a = (0.3 * np.sin(2 * np.pi * 220 * tt)).astype(np.float32)
        else:
            import torch

            ref = HERE / s['reference'] if s['reference'] != 'none' else None
            kw = dict(exaggeration=s['exaggeration'], cfg_weight=s['cfg_weight'], temperature=s['temperature'])
            if ref is not None and ref.exists():
                kw['audio_prompt_path'] = str(ref)
            with torch.inference_mode():
                wav = _model.generate(t, **kw)
            a = wav.squeeze().detach().cpu().numpy()
    a = finish(a, s['pace'], s['bright'])
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
