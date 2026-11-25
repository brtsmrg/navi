"""Makes the same listening samples with Qwen3-TTS (Apache-2.0) so it can be compared with the Chatterbox voice by ear."""
import io, json, sys, time, wave
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402  (only used for its sharpen/finish chain, so both voices get the same polish)

OUT = HERE / 'samples'
PREFIX = 'q1-'
INSTRUCT = 'Calm, clear and quick, like a rally co-driver reading pace notes. Crisp consonants, no trailing sounds.'
SPEAKERS = ['Ryan', 'Aiden']
WORDINGS = {
    'W1-numbers': ['Right three into left three.', 'Left three into right three.', 'Left four into right three.'],
    'W2-plain-english': ['Medium right, into medium left.', 'Medium left, into medium right.', 'Medium left, into easy right.'],
}


def load():
    from qwen_tts import Qwen3TTSModel

    for name, use_instruct in (('Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice', True), ('Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice', False)):
        for attn in ('sdpa', None):
            try:
                kw = dict(device_map='cuda:0', dtype=torch.bfloat16)
                if attn:
                    kw['attn_implementation'] = attn
                m = Qwen3TTSModel.from_pretrained(name, **kw)
                print('loaded', name, 'attn', attn, flush=True)
                return m, name, use_instruct
            except Exception as e:  # out of memory, unknown option, no network ...
                print('could not load', name, 'attn', attn, '->', str(e)[:200], flush=True)
                torch.cuda.empty_cache()
    raise SystemExit('No Qwen3-TTS model could be loaded. See the lines above.')


def say(m, use_instruct, text, speaker):
    kw = dict(text=text, language='English', speaker=speaker)
    if use_instruct:
        kw['instruct'] = INSTRUCT
    wavs, sr = m.generate_custom_voice(**kw)
    return np.asarray(wavs[0], dtype=np.float32).reshape(-1), int(sr)


def write(path, pcm_list, sr):
    data = np.concatenate(pcm_list)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(data.tobytes())


def main():
    OUT.mkdir(exist_ok=True)
    if not torch.cuda.is_available():
        raise SystemExit('The graphics card is not visible to Python (torch.cuda is False).')
    m, model_name, use_instruct = load()
    report = [f'model {model_name} instruct={use_instruct}']
    for speaker in SPEAKERS:
        for name, calls in WORDINGS.items():
            raw_parts, fin_parts = [], []
            for text in calls:
                t0 = time.time()
                a, sr = say(m, use_instruct, text, speaker)
                server.SR = sr
                f, junk = server.finish(a, 1.0, 1.4, 0.8, 0.12)
                raw = a * (0.92 / max(float(np.max(np.abs(a))), 1e-4))
                gap = np.zeros(int(sr * 1.3), dtype='<i2')
                raw_parts += [(np.clip(raw, -1, 1) * 32767).astype('<i2'), gap]
                fin_parts += [(np.clip(f, -1, 1) * 32767).astype('<i2'), gap]
                report.append(f'{speaker} | {name} | {text} | raw {a.size / sr:.2f}s finished {f.size / sr:.2f}s junk_cut {junk} ms | made in {time.time() - t0:.1f}s')
                print(report[-1], flush=True)
            write(OUT / f'Navi-home-voice-{PREFIX}{speaker}-{name}-raw.wav', raw_parts, sr)
            write(OUT / f'Navi-home-voice-{PREFIX}{speaker}-{name}-finished.wav', fin_parts, sr)
    (OUT / 'q1-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
    print('DONE', flush=True)


if __name__ == '__main__':
    main()
