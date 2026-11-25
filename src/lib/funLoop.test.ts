import { describe, expect, it, vi } from 'vitest';
import type { RoadWay } from '@/core';
import { localToLngLat } from '@/core/geo';

const O: [number, number] = [-75.62, 45.52];
const grid: RoadWay[] = [];
for (let k = -4000; k <= 4000; k += 500) {
  const h: [number, number][] = [];
  const v: [number, number][] = [];
  for (let t = -4000; t <= 4000; t += 500) {
    h.push(localToLngLat(O, t, k));
    v.push(localToLngLat(O, k, t));
  }
  grid.push({ id: `h${k}`, coords: h, cls: 'tertiary' }, { id: `v${k}`, coords: v, cls: 'tertiary' });
}
const bend: RoadWay = { id: 'bend', coords: Array.from({ length: 40 }, (_, i) => localToLngLat(O, -4000 + i * 200, 1000 + 60 * Math.sin(i))), cls: 'secondary' };

vi.mock('@/providers/overpass', async () => {
  const real = await vi.importActual<typeof import('@/providers/overpass')>('@/providers/overpass');
  return { ...real, fetchCell: vi.fn(async () => grid), fetchTile: vi.fn(async () => [...grid, bend]) };
});

describe('planFunLoop', () => {
  it('opens a loop as the current route', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { longitude: O[0], latitude: O[1] } }) } });
    const { planFunLoop } = await import('./funLoop');
    const { useApp } = await import('./store');
    const seen: number[] = [];
    await planFunLoop(12000, (p) => seen.push(p.done));
    const st = useApp.getState().stage!;
    expect(st).not.toBeNull();
    expect(st.stats.distanceM).toBeGreaterThan(7000);
    expect(st.notes.length).toBeGreaterThan(3);
    expect(seen.length).toBeGreaterThan(1);
    expect(useApp.getState().notice).toMatch(/Fun loop/);
  });

  it('says so when the roads cannot be read', async () => {
    const o = await import('@/providers/overpass');
    vi.mocked(o.fetchCell).mockRejectedValue(new Error('x'));
    vi.mocked(o.fetchTile).mockRejectedValue(new Error('x'));
    const { planFunLoop } = await import('./funLoop');
    await expect(planFunLoop(12000, () => {})).rejects.toThrow(/not reachable/);
  });
});
