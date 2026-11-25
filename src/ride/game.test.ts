import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localToLngLat } from '@/core/geo';

const O: [number, number] = [-75.62, 45.52];
const at = (x: number, y: number) => localToLngLat(O, x, y);
// east for 1.2 km, a tight right-hander, then south for 1.5 km; a side road branches off to the north at x = 600
const road: [number, number][] = [];
for (let x = 0; x <= 1200; x += 20) road.push([x, 0]);
for (let a = 0; a <= 90; a += 10) road.push([1200 + 25 * Math.sin((a * Math.PI) / 180), -25 + 25 * Math.cos((a * Math.PI) / 180) - 0]);
for (let y = -50; y >= -1500; y -= 20) road.push([1225, y]);
const side: [number, number][] = [[600, 0], [600, 300], [600, 600]];

vi.mock('@/providers/overpass', async () => {
  const real = await vi.importActual<typeof import('@/providers/overpass')>('@/providers/overpass');
  return {
    ...real,
    fetchCell: vi.fn(async () => [
      { id: 'main', coords: road.map(([x, y]) => at(x, y)), cls: 'secondary', name: 'Main Rd' },
      { id: 'side', coords: side.map(([x, y]) => at(x, y)), cls: 'minor', name: 'Side St' },
    ]),
    fetchHazardTile: vi.fn(async () => []),
  };
});
vi.mock('@/lib/audio', () => ({ cue: vi.fn(), releaseAudio: vi.fn(), unlockAudio: vi.fn() }));
vi.mock('@/lib/speech', () => ({ listVoices: () => [1], primeSpeech: vi.fn(), say: vi.fn(), stopSpeaking: vi.fn(), speechSupported: () => false }));
vi.mock('@/lib/wakeLock', () => ({ keepAwake: () => () => {} }));
vi.mock('@/lib/clips', () => ({ warmClips: vi.fn() }));

describe('game mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { getGamepads: () => [], vibrate: () => true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drives a virtual car on the road, judges the corner, and exits cleanly', async () => {
    const { startGame, stopRide } = await import('./controller');
    const { useGame } = await import('./gameState');
    const { useRideStore } = await import('@/lib/store');
    const { setTouch } = await import('./gameInput');
    startGame(at(40, 3));
    expect(useRideStore.getState().kind).toBe('game');
    setTouch({ throttle: 1 });
    const kinds = new Set<string>();
    let topV = 0;
    for (let i = 0; i < 20 * 120; i++) {
      await vi.advanceTimersByTimeAsync(50);
      const f = useGame.getState().feedback;
      if (f) kinds.add(f.kind);
      topV = Math.max(topV, useRideStore.getState().v);
    }
    const g = useGame.getState();
    expect(g.distanceM).toBeGreaterThan(900);
    expect(topV).toBeGreaterThan(20);
    expect(kinds.has('crash') || kinds.has('sloppy')).toBe(true); // flat out into a hairpin
    stopRide();
    expect(useRideStore.getState().active).toBe(false);
  });

  it('takes a corner cleanly when the driver brakes for it', async () => {
    const { startGame, stopRide } = await import('./controller');
    const { useGame } = await import('./gameState');
    const { useRideStore } = await import('@/lib/store');
    const { setTouch } = await import('./gameInput');
    startGame(at(40, 3));
    const kinds: string[] = [];
    for (let i = 0; i < 20 * 150; i++) {
      await vi.advanceTimersByTimeAsync(50);
      const r = useRideStore.getState();
      const x = r.lngLat ? (r.lngLat[0] - O[0]) * 111320 * Math.cos((O[1] * Math.PI) / 180) : 0;
      // gas on the straight, then brake from 250 m before the corner and hold about 10 m/s through it
      setTouch({ throttle: x < 900 ? 1 : r.v < 9 ? 0.4 : 0, brake: x >= 950 && r.v > 10 ? 1 : 0 });
      const f = useGame.getState().feedback;
      if (f && kinds[kinds.length - 1] !== f.kind) kinds.push(f.kind);
    }
    expect(kinds).toContain('clean');
    expect(kinds).not.toContain('crash');
    expect(useGame.getState().score).toBeGreaterThan(50);
    stopRide();
  });

  it('steering at a junction chooses the road', async () => {
    const { startGame, stopRide } = await import('./controller');
    const { useRideStore } = await import('@/lib/store');
    const { setTouch } = await import('./gameInput');
    const run = async (steer: number) => {
      startGame(at(40, 3));
      for (let i = 0; i < 20 * 70; i++) {
        await vi.advanceTimersByTimeAsync(50);
        const r = useRideStore.getState();
        setTouch({ throttle: r.v < 12 ? 0.6 : 0, steer });
      }
      const ll = useRideStore.getState().lngLat!;
      const out = { x: (ll[0] - O[0]) * 111320 * Math.cos((O[1] * Math.PI) / 180), y: (ll[1] - O[1]) * 110540 };
      stopRide();
      return out;
    };
    const left = await run(-1);
    expect(left.y).toBeGreaterThan(80); // up the side road
    const straight = await run(0);
    expect(Math.abs(straight.y)).toBeLessThan(40); // stayed on the main road
    expect(straight.x).toBeGreaterThan(700);
  });

  it('starts some way off the road: the car goes onto the nearest road and drives the way it points', async () => {
    const { startGame, stopRide } = await import('./controller');
    const { useRideStore } = await import('@/lib/store');
    const { setTouch } = await import('./gameInput');
    startGame(at(1500, 0));
    setTouch({ throttle: 1, steer: 0 });
    for (let i = 0; i < 20 * 15; i++) await vi.advanceTimersByTimeAsync(50);
    const r = useRideStore.getState();
    const y = (r.lngLat![1] - O[1]) * 110540;
    expect(y).toBeLessThan(-150); // went south down the long road, not back west
    stopRide();
  });
});
