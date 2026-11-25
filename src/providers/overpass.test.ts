import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQuery, cellOf, cellsAround, clearRoadCache, fetchCell, parseOverpass } from './overpass';

const sample = {
  elements: [
    { type: 'way', id: 1, tags: { highway: 'secondary', ref: 'D7', name: 'Route des Lacs' }, geometry: [{ lat: 45.1, lon: -75.1 }, { lat: 45.101, lon: -75.1 }] },
    { type: 'way', id: 2, tags: { highway: 'residential', oneway: 'yes' }, geometry: [{ lat: 45.1, lon: -75.1 }, { lat: 45.1, lon: -75.099 }] },
    { type: 'way', id: 3, tags: { highway: 'primary', junction: 'roundabout' }, geometry: [{ lat: 45.2, lon: -75.2 }, { lat: 45.2, lon: -75.199 }, { lat: 45.201, lon: -75.199 }] },
    { type: 'way', id: 4, tags: { highway: 'footway' }, geometry: [{ lat: 45.1, lon: -75.1 }, { lat: 45.1, lon: -75.0 }] },
    { type: 'way', id: 5, tags: { highway: 'tertiary' }, geometry: [{ lat: 45.1, lon: -75.1 }] },
    { type: 'way', id: 6, tags: { highway: 'tertiary' }, geometry: [{ lat: 95, lon: -75.1 }, { lat: 45.1, lon: -75.1 }] },
    { type: 'node', id: 7 },
    'junk',
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  clearRoadCache();
});

describe('overpass road data', () => {
  it('keeps real roads and drops everything else', () => {
    const w = parseOverpass(sample);
    expect(w.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(w[0]).toMatchObject({ cls: 'secondary', ref: 'D7', name: 'Route des Lacs', oneway: 'no' });
    expect(w[1].oneway).toBe('yes');
    expect(w[2].oneway).toBe('yes'); // roundabouts only go one way round
  });

  it('survives rubbish', () => {
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({ elements: 'x' })).toEqual([]);
    expect(parseOverpass({})).toEqual([]);
  });

  it('asks for one square, public roads only, over https', () => {
    const q = buildQuery({ i: -7562, j: 4552 });
    expect(q).toContain('(45.52000,-75.62000,45.53000,-75.61000)');
    expect(q).toContain('["access"!~"^(private|no)$"]');
    expect(q).not.toMatch(/footway|path|track|service/);
  });

  it('lists the nine squares around a point, nearest first', () => {
    const c = cellsAround([-75.6251, 45.5249]);
    expect(c).toHaveLength(9);
    expect(c[0]).toEqual(cellOf([-75.6251, 45.5249]));
  });

  it('falls back to the second server and then remembers the answer', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://overpass-api.de')) throw new Error('busy');
      return { ok: true, status: 200, json: async () => sample };
    });
    const a = await fetchCell({ i: 1, j: 2 });
    expect(a).toHaveLength(3);
    expect(calls.length).toBe(2);
    await fetchCell({ i: 1, j: 2 });
    expect(calls.length).toBe(2); // served from memory
    expect(calls.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('reports a clear error when every server fails', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(fetchCell({ i: 3, j: 4 })).rejects.toThrow(/429/);
  });

  it('tries the whole list again when every server is busy the first time', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      if (n <= 3) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => sample };
    });
    const a = await fetchCell({ i: 5, j: 6 });
    expect(a).toHaveLength(3);
    expect(n).toBe(4); // three servers failed, then the first one answered in round two
  });

  it('stops at once when the caller cancels', async () => {
    const ctl = new AbortController();
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      n++;
      ctl.abort();
      throw new Error('aborted');
    });
    await expect(fetchCell({ i: 7, j: 8 }, ctl.signal)).rejects.toThrow();
    expect(n).toBe(1);
  });
});
