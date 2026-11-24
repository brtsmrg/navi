import { describe, expect, it } from 'vitest';
import { DEVICE_VOICES, urgentText } from './engine';
import { VOCAB } from './vocab';

describe('on-phone voice text', () => {
  it('ends each take with an exclamation mark, but keeps a lead-in comma', () => {
    expect(urgentText('Left three, tightens, one fifty, right two.')).toBe('Left three, tightens, one fifty, right two!');
    expect(urgentText('In two hundred metres,')).toBe('In two hundred metres,');
  });
  it('offers voices that exist in the model', () => {
    expect(DEVICE_VOICES.map((v) => v.id)).toContain('bm_lewis');
  });
  it('knows the punctuation and the main sound symbols', () => {
    for (const ch of [',', '.', '!', ' ', 'ə', 'ˈ']) expect(VOCAB[ch]).toBeTypeOf('number');
  });
});
