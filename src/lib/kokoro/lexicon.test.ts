import { describe, expect, it } from 'vitest';
import { generateStage } from '@/core';
import { parseRoute } from '@/providers/valhalla';
import fixture from '@/providers/fixtures/stelvio-prad-valhalla.json';
import { DEFAULTS } from '@/lib/store';
import { routeSegments } from '@/lib/premium';
import LEXICON from './lexicon.json';

// The free on-phone voice has no pronunciation engine: every word of every call must be in the word list.
describe('on-phone voice word list', () => {
  const stage = generateStage(parseRoute(fixture as never));
  for (const dialect of ['rally', 'plain', 'rally-reverse'] as const) {
    it(`covers every word a ${dialect} road can say`, () => {
      const segs = routeSegments(stage, { ...DEFAULTS, dialect });
      const missing = new Set<string>();
      for (const seg of segs) for (const w of seg.toLowerCase().replace(/[;:,.!?]/g, ' ').split(/\s+/).filter(Boolean)) if (!(w in LEXICON.gb)) missing.add(w);
      expect([...missing]).toEqual([]);
    });
  }
});
