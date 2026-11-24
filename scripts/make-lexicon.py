#!/usr/bin/env python3
"""
Makes src/lib/kokoro/lexicon.json: how every word the co-driver can say is pronounced, for the free on-phone voice.

The phone looks words up here instead of running a pronunciation engine (espeak-ng is GPL and is not shipped in the app).
Pronunciations come from the misaki "gold" dictionaries (Apache 2.0, the ones Kokoro was trained with). A word they lack
(for example "tightens") is spoken once by espeak-ng on this computer and the resulting sounds are written down; only that
list of sounds ships, not espeak.

Usage: pip install misaki kokoro-onnx; python3 scripts/make-lexicon.py
"""
import json, os, re, sys
import misaki
from kokoro_onnx.tokenizer import Tokenizer

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = os.path.join(os.path.dirname(misaki.__file__), 'data')
gold = {'gb': json.load(open(os.path.join(data, 'gb_gold.json'))), 'us': json.load(open(os.path.join(data, 'us_gold.json')))}

words = set()
for f in ['george.json']:
    for key in json.load(open(os.path.join(root, 'public/voices', f)))['clips']:
        for w in key.replace('.', ' ').replace(',', ' ').split():
            words.add(w.lower())
# words the planner writes that no recording may cover
words |= set('in metres meters feet and into careful caution navi sound check is on go slow down'.split())
words |= set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand'.split())
words |= set('first second third fourth fifth sixth seventh eighth ninth tenth'.split())

tok = Tokenizer()

def pick(v):
    if isinstance(v, dict):
        return v.get('DEFAULT') or next(iter(v.values()))
    return v

out = {'gb': {}, 'us': {}}
fallback = []
for region, lang in (('gb', 'en-gb'), ('us', 'en-us')):
    for w in sorted(words):
        v = pick(gold[region].get(w))
        if not v or re.fullmatch(r'[a-z]+', v):  # missing, or a placeholder equal to the spelling
            v = tok.phonemize(w, lang).strip()
            fallback.append(f'{region}:{w}')
        if v == w:  # espeak could not say it either (a very short function word): borrow the other region's sounds
            v = pick(gold['us' if region == 'gb' else 'gb'].get(w)) or v
        out[region][w] = v
json.dump(out, open(os.path.join(root, 'src/lib/kokoro/lexicon.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
print(len(words), 'words;', len(fallback), 'from espeak:', ' '.join(fallback[:60]), file=sys.stderr)
