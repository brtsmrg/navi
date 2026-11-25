import { describe, expect, it } from 'vitest';
import { addHazards, composeCall, generateStage, noteText } from './index';
import { openTestStage } from './synth';
import { parseHazards } from '@/providers/overpass';

const stage = generateStage(openTestStage());
describe('hazard calls', () => {
  it('adds a note for a point on the route and ignores one far off it', () => {
    const c = stage.route.coords;
    const mid = c[Math.floor(c.length / 2)];
    const out = addHazards(stage, [
      { lng: mid[0], lat: mid[1], kind: 'bump' },
      { lng: mid[0] + 0.01, lat: mid[1] + 0.01, kind: 'camera' },
    ]);
    const hz = out.notes.filter((n) => n.kind === 'hazard');
    expect(hz.length).toBe(1);
    expect(hz[0].hazard).toBe('bump');
    expect(noteText(hz[0], { dialect: 'plain', units: 'metric' })).toBe('Bump');
    const sorted = out.notes.every((n, i, a) => i === 0 || a[i - 1].kind === 'finish' || n.kind === 'finish' || a[i - 1].s <= n.s);
    expect(sorted).toBe(true);
    expect(out.notes[out.notes.length - 1].kind).toBe('finish');
    expect(out.stats.noteCount).toBe(out.notes.length);
  });

  it('counts two of the same kind close together once, and is idempotent', () => {
    const c = stage.route.coords;
    const mid = c[Math.floor(c.length / 2)];
    const h = [{ lng: mid[0], lat: mid[1], kind: 'rail' as const }, { lng: mid[0] + 0.00005, lat: mid[1], kind: 'rail' as const }];
    const once = addHazards(stage, h);
    expect(once.notes.filter((n) => n.kind === 'hazard').length).toBe(1);
    expect(addHazards(once, h).notes.length).toBe(once.notes.length);
  });

  it('is spoken inside a call with the corner after it', () => {
    const c = stage.route.coords;
    const mid = c[Math.floor(c.length / 2)];
    const out = addHazards(stage, [{ lng: mid[0], lat: mid[1], kind: 'camera' }]);
    const i = out.notes.findIndex((n) => n.kind === 'hazard');
    expect(composeCall([out.notes[i]], { dialect: 'rally', units: 'metric' })).toBe('Speed camera');
  });

  it('reads the map answer and skips what it does not know', () => {
    const hz = parseHazards({
      elements: [
        { type: 'node', lat: 45.5, lon: -75.6, tags: { traffic_calming: 'table' } },
        { type: 'node', lat: 45.51, lon: -75.6, tags: { railway: 'level_crossing' } },
        { type: 'node', lat: 45.52, lon: -75.6, tags: { highway: 'speed_camera' } },
        { type: 'node', lat: 45.53, lon: -75.6, tags: { traffic_calming: 'choker' } },
        { type: 'node', lat: 45.54, lon: -75.6, tags: { traffic_calming: 'island' } },
        { type: 'node', lat: 999, lon: -75.6, tags: { traffic_calming: 'bump' } },
        { type: 'way', tags: {} },
      ],
    });
    expect(hz.map((h) => h.kind)).toEqual(['bump', 'rail', 'camera', 'narrow']);
    expect(parseHazards(null)).toEqual([]);
  });
});
