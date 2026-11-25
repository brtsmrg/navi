"""Makes listening samples with the real voice model (the locked-in M3 voice) so wordings can be compared by ear."""
import io, json, sys, wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402

PREFIX = 'v6-'

# the same chained turns in three wordings; each wording becomes one file
WORDINGS = {
    'W1-numbers': [['Right three into left three.'], ['Left three into right three.'], ['Left four into right three.']],
    'W2-plain-english': [['Medium right, into medium left.'], ['Medium left, into medium right.'], ['Medium left, into easy right.']],
    'W3-stressed-numbers': [['Right three. Into left three.'], ['Left three. Into right three.'], ['Left four. Into right three.']],
}


def main():
    out = HERE / 'samples'
    out.mkdir(exist_ok=True)
    server.SETTINGS_FILE.unlink(missing_ok=True)  # use the locked-in defaults
    server.load_model()
    report = []
    for name, calls in WORDINGS.items():
        pcm = []
        for call in calls:
            for i, seg in enumerate(call):
                wav = server.synth(seg)
                report.append(f"{name} | {seg} | {json.dumps(server.LAST)}")
                with wave.open(io.BytesIO(wav)) as w:
                    pcm.append(np.frombuffer(w.readframes(w.getnframes()), dtype='<i2'))
                pcm.append(np.zeros(int(server.SR * (0.12 if i < len(call) - 1 else 1.3)), dtype='<i2'))
        data = np.concatenate(pcm)
        with wave.open(str(out / f'Navi-home-voice-{PREFIX}{name}.wav'), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(server.SR); w.writeframes(data.tobytes())
        print('made', name, round(len(data) / server.SR, 1), 'seconds', flush=True)
    (out / f'v6-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
