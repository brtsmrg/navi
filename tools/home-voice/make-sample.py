"""Makes listening samples with the real voice model, in a few styles, so the best one can be picked by ear."""
import json, sys, wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

PREFIX = 'v3-'

CALLS = [
    ['Junction sharp right.'],
    ['In two hundred metres,', 'medium left tightening, medium left into medium right.'],
    ['In one hundred and fifty metres,', 'medium right, medium left tightening into medium right.'],
    ['Careful. In sixty metres,', 'hairpin right.'],
    ['Left three tightens and left four into right four.'],
    ['Right three into left three.'],
]
STYLES = {
    'S1-calm-sharp': {'exaggeration': 0.55, 'cfg_weight': 0.5, 'temperature': 0.7, 'bright': 1.0, 'reference': 'reference.wav'},
    'S2-calm-bright-ref': {'exaggeration': 0.55, 'cfg_weight': 0.5, 'temperature': 0.7, 'bright': 0.8, 'reference': 'reference-bright.wav'},
    'S3-default-voice': {'exaggeration': 0.55, 'cfg_weight': 0.5, 'temperature': 0.7, 'bright': 1.0, 'reference': 'none'},
    'S4-energetic-bright-ref': {'exaggeration': 0.7, 'cfg_weight': 0.5, 'temperature': 0.7, 'bright': 0.8, 'reference': 'reference-bright.wav'},
}


def main():
    out = HERE / 'samples'
    out.mkdir(exist_ok=True)
    server.load_model()
    for name, st in STYLES.items():
        server.SETTINGS_FILE.write_text(json.dumps(st))
        pcm = []
        t0 = time.time() if 'time' in globals() else None
        for call in CALLS:
            for i, seg in enumerate(call):
                wav = server.synth(seg)
                import io
                with wave.open(io.BytesIO(wav)) as w:
                    pcm.append(np.frombuffer(w.readframes(w.getnframes()), dtype='<i2'))
                pcm.append(np.zeros(int(server.SR * (0.12 if i < len(call) - 1 else 1.1)), dtype='<i2'))
        data = np.concatenate(pcm)
        with wave.open(str(out / f'Navi-home-voice-{PREFIX}{name}.wav'), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(server.SR); w.writeframes(data.tobytes())
        print('made', name, round(len(data) / server.SR, 1), 'seconds', flush=True)
    server.SETTINGS_FILE.unlink(missing_ok=True)


if __name__ == '__main__':
    import time
    main()
