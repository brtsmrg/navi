import { describe, expect, it } from 'vitest';
import {
  CallScheduler,
  RouteTracker,
  composeCall,
  cornerSpeedMps,
  drive,
  demoStage,
  estimateSpeechMs,
  fullLabel,
  generateStage,
  noteText,
  severityFromRadius,
  speedProfile,
  synthRoute,
  twistScore,
  type Note,
  type SynthSegment,
} from './index';

const S = (length: number): SynthSegment => ({ type: 'straight', length });
const L = (radius: number, angleDeg: number): SynthSegment => ({ type: 'arc', radius, angleDeg, side: 'L' });
const R = (radius: number, angleDeg: number): SynthSegment => ({ type: 'arc', radius, angleDeg, side: 'R' });

describe('ground truth: circular arcs of known radius', () => {
  const cases: [number, 1 | 2 | 3 | 4 | 5 | 6][] = [
    [15, 1],
    [35, 2],
    [80, 3],
    [150, 4],
    [250, 5],
    [400, 6],
  ];
  for (const [radius, sev] of cases) {
    for (const side of ['L', 'R'] as const) {
      it(`R=${radius} m ${side} -> severity ${sev}`, () => {
        const seg = side === 'L' ? L(radius, 90) : R(radius, 90);
        const st = generateStage(synthRoute([S(250), seg, S(250)]));
        expect(st.corners).toHaveLength(1);
        const c = st.corners[0];
        expect(c.side).toBe(side);
        expect(c.radius / radius).toBeGreaterThan(0.94);
        expect(c.radius / radius).toBeLessThan(1.06);
        expect(Math.abs(c.angleDeg - 90)).toBeLessThan(4);
        expect(c.severity).toBe(sev);
      });
    }
  }

  it('flat road has no corners', () => {
    const st = generateStage(synthRoute([S(2000)]));
    expect(st.corners).toHaveLength(0);
    expect(st.stats.twistScore).toBe(0);
  });

  it('classifies a hairpin', () => {
    const st = generateStage(synthRoute([S(200), L(14, 180), S(200)]));
    expect(st.corners).toHaveLength(1);
    expect(st.corners[0].shape).toBe('hairpin');
    expect(st.corners[0].severity).toBe(1);
  });

  it('classifies a square corner', () => {
    const st = generateStage(synthRoute([S(200), R(12, 90), S(200)]));
    expect(st.corners[0].shape).toBe('square');
  });

  it('keeps an S-bend as two corners in the right order', () => {
    const st = generateStage(synthRoute([S(150), L(80, 60), R(80, 60), S(150)]));
    expect(st.corners.map((c) => c.side)).toEqual(['L', 'R']);
  });

  it('detects tightening and opening', () => {
    const tight = generateStage(synthRoute([S(150), L(120, 50), L(40, 60), S(150)]));
    expect(tight.corners).toHaveLength(1);
    expect(tight.corners[0].tightens).toBe(true);
    expect(tight.corners[0].severity).toBe(2);
    const open = generateStage(synthRoute([S(150), R(40, 60), R(120, 50), S(150)]));
    expect(open.corners[0].opens).toBe(true);
  });

  it('survives digitisation noise (0.2 m sigma)', () => {
    const st = generateStage(synthRoute([S(250), L(100, 90), S(250)], { noiseM: 0.2, seed: 7 }));
    expect(st.corners).toHaveLength(1);
    expect(st.corners[0].radius / 100).toBeGreaterThan(0.75);
    expect(st.corners[0].radius / 100).toBeLessThan(1.3);
  });

  it('counts 48 hairpins on a Stelvio-style zigzag', () => {
    const segs: SynthSegment[] = [S(200)];
    for (let i = 0; i < 48; i++) segs.push(i % 2 ? R(14, 180) : L(14, 180), S(60));
    const st = generateStage(synthRoute(segs));
    expect(st.stats.hairpins).toBe(48);
    expect(st.corners).toHaveLength(48);
  });

  it('is independent of source vertex density', () => {
    const a = generateStage(synthRoute([S(200), L(60, 90), S(200)], { stepM: 1 }));
    const b = generateStage(synthRoute([S(200), L(60, 90), S(200)], { stepM: 8 }));
    expect(Math.abs(a.corners[0].radius - b.corners[0].radius) / 60).toBeLessThan(0.08);
  });
});

describe('severity scale', () => {
  it('matches the physics derivation (0.45 g bin edges)', () => {
    expect(severityFromRadius(27)).toBe(1);
    expect(severityFromRadius(28)).toBe(2);
    expect(severityFromRadius(112)).toBe(4);
    expect(severityFromRadius(319)).toBe(6);
    // v = sqrt(a r): 28 m at 0.45 g is ~40 km/h
    expect(cornerSpeedMps(28, 0.45) * 3.6).toBeGreaterThan(39);
    expect(cornerSpeedMps(28, 0.45) * 3.6).toBeLessThan(41);
  });
  it('twist score is monotone and bounded', () => {
    expect(twistScore(0)).toBe(0);
    expect(twistScore(900)).toBeGreaterThan(90);
    expect(twistScore(100)).toBeLessThan(twistScore(300));
  });
});

describe('phrases', () => {
  const base: Note = { id: 'a', kind: 'corner', s: 0, sEnd: 30, side: 'L', severity: 4, shape: 'bend', mods: {} };
  it('co-driver dialect', () => {
    expect(noteText({ ...base, mods: { long: true, tightens: true } }, { dialect: 'rally', units: 'metric' })).toBe(
      'Left 4 long tightens',
    );
    expect(noteText({ ...base, shape: 'hairpin', severity: 1, mods: { caution: true } }, { dialect: 'rally', units: 'metric' })).toBe(
      'Caution, hairpin left',
    );
    expect(noteText(base, { dialect: 'rally-reverse', units: 'metric' })).toBe('Left 3');
  });
  it('plain dialect and distances', () => {
    const b: Note = { ...base, id: 'b', s: 160, sEnd: 190, side: 'R', severity: 3 };
    expect(composeCall([base, b], { dialect: 'rally', units: 'metric' })).toBe('Left 4, 130, right 3');
    expect(composeCall([base, b], { dialect: 'plain', units: 'metric' })).toBe('Medium left, then in 130 metres, medium right');
    const c: Note = { ...b, s: 70, sEnd: 100 };
    expect(composeCall([base, c], { dialect: 'rally', units: 'metric' })).toBe('Left 4 and right 3');
  });
  it('estimates speech time', () => {
    expect(estimateSpeechMs('Left 4 long, 100, right 3')).toBeGreaterThan(1500);
    expect(estimateSpeechMs('Left 4', 2)).toBeLessThan(estimateSpeechMs('Left 4', 1));
  });
});

describe('maneuvers', () => {
  it('folds a turn into the corner and silences roundabout geometry', () => {
    const route = synthRoute([S(300), R(14, 90), S(300), L(20, 270), S(300)]);
    const stage0 = generateStage(route);
    const turnIdx = route.coords.findIndex((_, i) => stage0.path.srcS[i] >= stage0.corners[0].apexS);
    const rbA = route.coords.findIndex((_, i) => stage0.path.srcS[i] >= stage0.corners[1].startS - 5);
    const rbB = route.coords.findIndex((_, i) => stage0.path.srcS[i] >= stage0.corners[1].endS + 5);
    const st = generateStage({
      ...route,
      maneuvers: [
        { shapeIndex: turnIdx, kind: 'turn', side: 'R' },
        { shapeIndex: rbA, endShapeIndex: rbB, kind: 'roundabout', exitCount: 2 },
      ],
    });
    const kinds = st.notes.map((n) => n.kind);
    expect(kinds).toEqual(['corner', 'roundabout', 'finish']);
    expect(st.notes[0].mods.junction).toBe(true);
    expect(noteText(st.notes[0], { dialect: 'rally', units: 'metric' })).toBe('Caution, junction square right');
    expect(noteText(st.notes[1], { dialect: 'plain', units: 'metric' })).toBe('Roundabout, take the 2nd exit');
  });
});

describe('glyph', () => {
  it('sketches a left corner turning left, in 0..1', () => {
    const st = generateStage(synthRoute([S(200), L(40, 90), S(200)]));
    const g = st.notes[0].glyph!;
    expect(g.length).toBeGreaterThan(6);
    for (const v of g) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(g[g.length - 2]).toBeLessThan(g[0]); // ends to the left
    expect(g[g.length - 1]).toBeGreaterThan(g[1]); // and further up than it starts? entry is up
  });
});

describe('tracker', () => {
  const route = demoStage();
  const tr = new RouteTracker(route.coords);
  it('recovers distance along route', () => {
    for (const s of [0, 500, 1234, 2500, tr.length - 10]) {
      const p = tr.pointAt(s);
      const snap = tr.snap(p.lngLat[0], p.lngLat[1]);
      expect(Math.abs(snap.s - s)).toBeLessThan(2);
      expect(snap.offsetM).toBeLessThan(1);
    }
  });
  it('flags off-route and never goes backwards', () => {
    const p = tr.pointAt(300);
    const off = tr.snap(p.lngLat[0], p.lngLat[1] + 0.0007, 280);
    expect(off.offsetM).toBeGreaterThan(60);
    const back = tr.snap(p.lngLat[0], p.lngLat[1], 320);
    expect(back.s).toBeGreaterThanOrEqual(320);
  });
});

describe('scheduler: simulated drives', () => {
  const stage = generateStage(demoStage());

  function run(cruise: number, leadSec = 7) {
    const v = speedProfile(stage.path, { cruiseMps: cruise, profile: 'road' });
    const samples = drive(stage.path, v, 250);
    const sch = new CallScheduler(stage.notes, {
      dialect: 'rally',
      units: 'metric',
      leadSec,
      maxGroup: 3,
      profile: 'road',
      speechRate: 1.1,
      brakeMps2: 4,
    });
    sch.reset(0);
    const arrive = (s: number) => {
      const i = samples.findIndex((x) => x.s >= s);
      return i < 0 ? samples[samples.length - 1].tMs : samples[i].tMs;
    };
    const calls: { tMs: number; text: string; noteIds: string[]; leadMs: number; urgency: string }[] = [];
    for (const smp of samples) {
      const c = sch.update(smp.s, smp.v, smp.tMs);
      if (c && c.kind === 'notes') {
        const first = stage.notes.find((n) => n.id === c.firstNoteId)!;
        calls.push({ tMs: smp.tMs, text: c.text, noteIds: c.noteIds, leadMs: arrive(first.s) - (smp.tMs + c.estMs), urgency: c.urgency });
      }
    }
    return { sch, calls };
  }

  for (const [label, cruise] of [['80 km/h', 22], ['110 km/h', 30.5]] as const) {
    it(`calls every note exactly once, in order, at ${label}`, () => {
      const { sch, calls } = run(cruise);
      expect(sch.missed).toEqual([]);
      const ids = calls.flatMap((c) => c.noteIds);
      expect(ids).toEqual(stage.notes.map((n) => n.id));
      expect(new Set(ids).size).toBe(ids.length);
    });
    it(`finishes speaking before the corner at ${label}`, () => {
      const { calls } = run(cruise);
      const leads = calls.map((c) => c.leadMs / 1000);
      expect(Math.min(...leads)).toBeGreaterThan(1.5);
      const good = leads.filter((l) => l >= 5).length / leads.length;
      expect(good).toBeGreaterThan(0.7);
    });
  }

  it('anticipation setting moves calls earlier', () => {
    const early = run(22, 12).calls;
    const late = run(22, 5).calls;
    expect(early[3].tMs).toBeLessThan(late[3].tMs);
  });

  it('leads with caution and then alerts when braking is late', () => {
    const st = generateStage(synthRoute([S(900), L(14, 180), S(300)]));
    const sch = new CallScheduler(st.notes);
    const out: { kind: string; text: string; s: number }[] = [];
    for (let s = 300; s < 880; s += 5) {
      const c = sch.update(s, 35, s * 10);
      if (c) out.push({ kind: c.kind, text: c.text, s });
    }
    expect(out[0].kind).toBe('notes');
    expect(out[0].text.startsWith('Caution')).toBe(true);
    const alert = out.find((c) => c.kind === 'alert');
    expect(alert?.text).toBe('Slow');
    expect(alert!.s).toBeGreaterThan(600);
  });

  it('no alerts for a driver who brakes early (2.5 m/s2)', () => {
    const v = speedProfile(stage.path, { cruiseMps: 25, brakeMps2: 2.5 });
    const sch = new CallScheduler(stage.notes);
    for (const smp of drive(stage.path, v, 250)) sch.update(smp.s, smp.v, smp.tMs);
    expect(sch.alerts).toEqual([]);
  });

  it('stays calm at a sensible speed', () => {
    const st = generateStage(synthRoute([S(900), L(80, 90), S(300)]));
    const sch = new CallScheduler(st.notes);
    let call = null;
    for (let s = 400; s < 900 && !call; s += 5) call = sch.update(s, 18, s * 10);
    expect(call!.urgency).toBe('normal');
  });
});

describe('full-word labels', () => {
  const base: Note = { id: 'n', kind: 'corner', s: 0, sEnd: 10, side: 'L', severity: 2, mods: {} };
  it('spells corners out', () => {
    expect(fullLabel(base)).toEqual({ dir: 'L', headline: 'Sharp left', detail: '' });
    expect(fullLabel({ ...base, side: 'R', severity: 6, mods: { long: true, tightens: true } })).toEqual({ dir: 'R', headline: 'Slight right', detail: 'long, tightens' });
    expect(fullLabel({ ...base, shape: 'hairpin', severity: 1 }).headline).toBe('Hairpin left');
    expect(fullLabel({ ...base, shape: 'square', side: 'R' }).headline).toBe('Right-angle right');
  });
  it('spells out non-corners', () => {
    expect(fullLabel({ ...base, kind: 'roundabout', side: undefined, mods: { exitCount: 2 } }).headline).toBe('Roundabout, 2nd exit');
    expect(fullLabel({ ...base, kind: 'finish', side: undefined }).headline).toBe('Arrive');
    expect(fullLabel({ ...base, kind: 'junction', mods: { sharpness: 'sharp' } }).headline).toBe('Turn sharp left');
  });
});
