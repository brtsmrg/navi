import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RoadWay } from '@/core/roam';

/** A tiny in-memory IndexedDB, enough for one object store with get, put, clear and a cursor. */
function fakeIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>();
  const dataFor = (n: string) => stores.get(n) ?? (stores.set(n, new Map()), stores.get(n)!);
  const later = (fn: () => void) => queueMicrotask(fn);
  const makeStore = (data: Map<string, unknown>) => ({
    get: (k: string) => {
      const r: { result?: unknown; onsuccess?: () => void } = {};
      later(() => ((r.result = data.get(k)), r.onsuccess?.()));
      return r;
    },
    put: (v: unknown, k: string) => void data.set(k, v),
    clear: () => void data.clear(),
    openCursor: () => {
      const keys = [...data.keys()];
      let i = 0;
      const r: { result: unknown; onsuccess?: () => void } = { result: null };
      const step = () => {
        r.result = i < keys.length ? { value: data.get(keys[i]), continue: () => (i++, later(step)) } : null;
        r.onsuccess?.();
      };
      later(step);
      return r;
    },
  });
  const tx = () => {
    const t: { objectStore: (n: string) => ReturnType<typeof makeStore>; oncomplete?: () => void } = { objectStore: (n: string) => makeStore(dataFor(n)) };
    later(() => later(() => t.oncomplete?.()));
    return t;
  };
  return {
    open: () => {
      const r: { result: { createObjectStore: () => void; objectStoreNames: { contains: () => boolean }; transaction: typeof tx }; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: { createObjectStore: () => {}, objectStoreNames: { contains: () => false }, transaction: tx } };
      later(() => (r.onupgradeneeded?.(), r.onsuccess?.()));
      return r;
    },
  };
}

const way = (id: string): RoadWay => ({ id, coords: [[-75.6, 45.5], [-75.59, 45.5]], cls: 'secondary' });

vi.mock('./overpass', async () => {
  const real = await vi.importActual<typeof import('./overpass')>('./overpass');
  return { ...real, fetchRaw: vi.fn(async () => [way('a'), way('b')]), fetchHazardTile: vi.fn(async () => [{ lng: -75.6, lat: 45.5, kind: 'bump' as const }]) };
});

describe('offline road pack', () => {
  beforeAll(() => {
    vi.stubGlobal('indexedDB', fakeIndexedDB());
  });

  it('knows which big tile a small square sits in', async () => {
    const { tileOfCell, tileOfPoint } = await import('./roadPack');
    expect(tileOfCell({ i: -7562, j: 4552 })).toEqual(tileOfPoint([-75.62, 45.52]));
    expect(tileOfCell({ i: 5, j: 10 })).toEqual({ i: 1, j: 2 });
  });

  it('saves tiles, resumes without refetching, reports and clears', async () => {
    const o = await import('./overpass');
    const { downloadPack, getPackTile, packInfo, clearPack } = await import('./roadPack');
    const at: [number, number] = [-75.62, 45.52];
    const seen: number[] = [];
    const r1 = await downloadPack(at, 3000, (p) => seen.push(p.done));
    expect(r1.failed).toBe(0);
    expect(r1.done).toBe(r1.total);
    const first = vi.mocked(o.fetchRaw).mock.calls.length;
    expect(first).toBe(r1.total);
    expect((await getPackTile({ i: Math.floor(at[0] / 0.05), j: Math.floor(at[1] / 0.05) }))?.length).toBe(2);
    const info = await packInfo();
    expect(info.tiles).toBe(r1.total);
    expect(info.ways).toBe(2 * r1.total);
    await downloadPack(at, 3000, () => {});
    expect(vi.mocked(o.fetchRaw).mock.calls.length).toBe(first); // nothing fetched twice
    await clearPack();
    expect((await packInfo()).tiles).toBe(0);
  });

  it('counts a failed tile and keeps going', async () => {
    const o = await import('./overpass');
    const { downloadPack, clearPack } = await import('./roadPack');
    await clearPack();
    vi.mocked(o.fetchRaw).mockRejectedValueOnce(new Error('busy'));
    const r = await downloadPack([-75.62, 45.52], 3000, () => {});
    expect(r.failed).toBe(1);
    expect(r.done).toBe(r.total - 1);
  });

  it('saves hazard points with each tile and reads them back', async () => {
    const { downloadPack, getPackHazards, clearPack } = await import('./roadPack');
    await clearPack();
    await downloadPack([-75.62, 45.52], 3000, () => {});
    const hz = await getPackHazards({ i: Math.floor(-75.62 / 0.05), j: Math.floor(45.52 / 0.05) });
    expect(hz?.[0].kind).toBe('bump');
  });
});
