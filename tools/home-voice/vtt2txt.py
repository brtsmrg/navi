"""Turns YouTube caption files (.vtt) into plain readable text with timestamps, dropping the repeated rolling lines."""
import re, sys
from pathlib import Path

folder = Path(sys.argv[1])
for f in sorted(folder.glob('*.vtt')):
    lines, last = [], ''
    stamp = ''
    for raw in f.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'(\d\d:\d\d:\d\d)\.\d+ --> ', raw)
        if m:
            stamp = m.group(1)
            continue
        t = re.sub(r'<[^>]+>', '', raw).strip()
        if not t or t.startswith(('WEBVTT', 'Kind:', 'Language:', 'NOTE')) or '-->' in t:
            continue
        if t == last:
            continue
        last = t
        lines.append(f'{stamp} {t}')
    out = f.with_suffix('.txt')
    out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('wrote', out.name, len(lines), 'lines')
