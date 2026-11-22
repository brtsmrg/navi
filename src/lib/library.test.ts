import { beforeEach, describe, expect, it } from 'vitest';
import type { Place } from '@/providers/photon';

// a tiny localStorage so the store can persist under the node test environment
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, v),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const { useLibrary } = await import('./library');

const P = (id: string, lng: number, lat: number, title = id): Place => ({ id, title, subtitle: '', lngLat: [lng, lat] });
const A = P('a', 10, 46);
const B = P('b', 11, 47);
const C = P('c', 12, 48);

beforeEach(() => {
  useLibrary.getState().wipe();
  mem.clear();
});

describe('library', () => {
  it('toggles favourites and recognises the same spot under another id', () => {
    const l = useLibrary.getState();
    l.toggleFav(A);
    expect(useLibrary.getState().favs).toHaveLength(1);
    expect(useLibrary.getState().isFav(P('other-id', 10, 46))).toBeTruthy();
    useLibrary.getState().toggleFav(A);
    expect(useLibrary.getState().favs).toHaveLength(0);
  });

  it('keeps recents newest-first without duplicates and caps the list', () => {
    const l = useLibrary.getState();
    l.pushRecent(A);
    l.pushRecent(B);
    l.pushRecent(A);
    expect(useLibrary.getState().recents.map((r) => r.place.id)).toEqual(['a', 'b']);
    for (let i = 0; i < 40; i++) useLibrary.getState().pushRecent(P(`x${i}`, i, i / 2));
    expect(useLibrary.getState().recents.length).toBe(30);
  });

  it('planning the same trip again updates it instead of duplicating, and keeps the pin', () => {
    const l = useLibrary.getState();
    const id1 = l.addTrip({ from: A, to: B, via: [], distanceM: 1000, corners: 3 });
    useLibrary.getState().pinTrip(id1, true, 'Sunday run');
    useLibrary.getState().addTrip({ from: A, to: B, via: [], distanceM: 1100, corners: 4 });
    const trips = useLibrary.getState().trips;
    expect(trips).toHaveLength(1);
    expect(trips[0].pinned).toBe(true);
    expect(trips[0].name).toBe('Sunday run');
    expect(trips[0].distanceM).toBe(1100);
  });

  it('clearing history keeps pinned trips', () => {
    const l = useLibrary.getState();
    const keep = l.addTrip({ from: A, to: B, via: [], distanceM: 1, corners: 1 });
    useLibrary.getState().addTrip({ from: A, to: C, via: [], distanceM: 2, corners: 1 });
    useLibrary.getState().pinTrip(keep, true);
    useLibrary.getState().clearTrips();
    expect(useLibrary.getState().trips.map((t) => t.id)).toEqual([keep]);
  });

  it('backs up and restores everything, and rejects other files', () => {
    const l = useLibrary.getState();
    l.setHome(A);
    l.toggleFav(B);
    l.pushRecent(C);
    const json = useLibrary.getState().exportJson();
    useLibrary.getState().wipe();
    expect(useLibrary.getState().home).toBeNull();
    expect(useLibrary.getState().importJson(json)).toBe(true);
    const s = useLibrary.getState();
    expect(s.home?.place.id).toBe('a');
    expect(s.favs[0].place.id).toBe('b');
    expect(s.recents[0].place.id).toBe('c');
    expect(s.importJson('{"app":"other"}')).toBe(false);
    expect(s.importJson('not json')).toBe(false);
  });

  it('persists to storage', () => {
    useLibrary.getState().setWork(A);
    expect(JSON.parse(mem.get('navi.library.v1') ?? '{}').work.place.id).toBe('a');
  });
});
