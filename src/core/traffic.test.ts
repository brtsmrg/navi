import { describe, expect, it } from 'vitest';
import { levelFromRatio, mergeSpans, sampleTraffic, TRAFFIC_COLOR } from './traffic';

describe('traffic', () => {
  it('maps speed ratio to four levels', () => {
    expect(levelFromRatio(80, 90)).toBe(0);
    expect(levelFromRatio(55, 90)).toBe(1);
    expect(levelFromRatio(30, 90)).toBe(2);
    expect(levelFromRatio(5, 90)).toBe(3);
    expect(levelFromRatio(10, 0)).toBe(0);
  });
  it('merges neighbours of the same level', () => {
    const m = mergeSpans([
      { from: 100, to: 200, level: 1 },
      { from: 0, to: 100, level: 1 },
      { from: 200, to: 300, level: 2 },
      { from: 300, to: 300, level: 3 },
    ]);
    expect(m).toEqual([
      { from: 0, to: 200, level: 1 },
      { from: 200, to: 300, level: 2 },
    ]);
  });
  it('keeps spans apart when the oncoming side differs', () => {
    const m = mergeSpans([
      { from: 0, to: 100, level: 1, opp: 0 },
      { from: 100, to: 200, level: 1, opp: 2 },
    ]);
    expect(m).toHaveLength(2);
  });
  it('uses the turn colours', () => {
    expect(TRAFFIC_COLOR[0]).toBe('#7fd6a1');
    expect(TRAFFIC_COLOR[3]).toBe('#ff3b30');
  });
  it('sample data covers the whole route without gaps', () => {
    const s = sampleTraffic(10000);
    expect(s[0].from).toBe(0);
    expect(s[s.length - 1].to).toBe(10000);
    for (let i = 1; i < s.length; i++) expect(s[i].from).toBe(s[i - 1].to);
    expect(sampleTraffic(0)).toEqual([]);
  });
});
