import { describe, expect, it, vi, beforeEach } from 'vitest';

// A straight road with a right-hand bend, west to east then turning south, in the Ottawa area.
const ROAD: [number, number][] = [];
for (let i = 0; i <= 40; i++) ROAD.push([-75.7 + i * 0.0005, 45.4]);
for (let i = 1; i <= 40; i++) ROAD.push([-75.7 + 40 * 0.0005 + Math.min(i, 6) * 0.0003 * 0, 45.4 - i * 0.0004]);

vi.mock('@/providers/overpass', async () => {
  const real = await vi.importActual<typeof import('@/providers/overpass')>('@/providers/overpass');
  return { ...real, fetchCell: vi.fn(async () => [{ id: 'w1', coords: ROAD, cls: 'secondary', name: 'Test Rd' }]) };
});
vi.mock('@/lib/audio', () => ({ cue: vi.fn(), releaseAudio: vi.fn(), unlockAudio: vi.fn() }));
vi.mock('@/lib/speech', () => ({ listVoices: () => [1], primeSpeech: vi.fn(), say: vi.fn(), stopSpeaking: vi.fn(), speechSupported: () => false }));
vi.mock('@/lib/wakeLock', () => ({ keepAwake: () => () => {} }));
vi.mock('@/lib/clips', () => ({ warmClips: vi.fn() }));

describe('free roam in the ride controller', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() } });
  });

  it('plans the road ahead from fixes and stops cleanly', async () => {
    const { startRoam, roamFix, stopRide } = await import('./controller');
    const { useRideStore, useApp } = await import('@/lib/store');
    startRoam();
    expect(useRideStore.getState().kind).toBe('roam');
    expect(useApp.getState().stage?.notes.length).toBe(0);
    const t0 = 1_000_000;
    roamFix({ lng: ROAD[2][0], lat: 45.4, t: t0, speed: 20, heading: 90 });
    await new Promise((r) => setTimeout(r, 20)); // road squares arrive
    roamFix({ lng: ROAD[4][0], lat: 45.4, t: t0 + 2000, speed: 20, heading: 90 });
    roamFix({ lng: ROAD[8][0], lat: 45.4, t: t0 + 6000, speed: 20, heading: 90 });
    const st = useApp.getState().stage!;
    expect(st.notes.length).toBeGreaterThan(0);
    expect(st.notes.some((n) => n.kind === 'finish')).toBe(false);
    expect(useRideStore.getState().s).toBeGreaterThan(0);
    stopRide();
    expect(useRideStore.getState().active).toBe(false);
  });
});
