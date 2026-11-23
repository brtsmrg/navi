import { describe, expect, it } from 'vitest';
import { voiceScore } from './speech';

describe('voiceScore', () => {
  it('ranks premium and enhanced voices above the standard one', () => {
    const premium = voiceScore({ name: 'Ava (Premium)', lang: 'en-US' });
    const enhanced = voiceScore({ name: 'Samantha (Enhanced)', lang: 'en-US' });
    const standard = voiceScore({ name: 'Samantha', lang: 'en-US' });
    const compact = voiceScore({ name: 'Daniel (Compact)', lang: 'en-GB' });
    expect(premium).toBeGreaterThan(enhanced);
    expect(enhanced).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(compact);
  });
  it('never picks a novelty voice over a normal one', () => {
    expect(voiceScore({ name: 'Zarvox', lang: 'en-US' })).toBeLessThan(0);
    expect(voiceScore({ name: 'Fred', lang: 'en-US' })).toBeLessThan(voiceScore({ name: 'Karen', lang: 'en-AU' }));
  });
});
