import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEDGE_MS, OVERPASS_MIRRORS, buildQuery, cellOf, cellsAround, clearRoadCache, fetchCell, parseOverpass } from './overpass';

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
  vi.useRealTimers();
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
      if (url.startsWith(OVERPASS_MIRRORS[0])) throw new Error('busy');
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
      if (n <= OVERPASS_MIRRORS.length) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => sample };
    });
    const a = await fetchCell({ i: 5, j: 6 });
    expect(a).toHaveLength(3);
    expect(n).toBe(OVERPASS_MIRRORS.length + 1); // every server failed, then one answered in round two
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

  it('does not wait for a hung server: the next one is asked after a short delay and the first good answer wins', async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    vi.stubGlobal('fetch', (url: string, init: { signal: AbortSignal }) => {
      asked.push(url);
      if (url.startsWith(OVERPASS_MIRRORS[0])) return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      return Promise.resolve({ ok: true, status: 200, json: async () => sample });
    });
    const p = fetchCell({ i: 11, j: 12 });
    await vi.advanceTimersByTimeAsync(HEDGE_MS + 50);
    expect(await p).toHaveLength(3);
    expect(asked).toHaveLength(2);
  });

  it('skips an error page that came back as text and a query the server gave up on', async () => {
    const answers: unknown[] = ['not json', { elements: [], remark: 'runtime error: Query timed out in "query" at line 1' }, sample];
    let n = 0;
    vi.stubGlobal('fetch', async () => {
      const a = answers[n++];
      return { ok: true, status: 200, json: async () => { if (typeof a === 'string') throw new SyntaxError('bad json'); return a; } };
    });
    expect(await fetchCell({ i: 13, j: 14 })).toHaveLength(3);
    expect(n).toBe(3);
  });

  it('asks the server that answered last first, and the one that just failed last', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      if (url.startsWith(OVERPASS_MIRRORS[0])) throw new Error('down');
      return { ok: true, status: 200, json: async () => sample };
    });
    await fetchCell({ i: 15, j: 16 });
    asked.length = 0;
    await fetchCell({ i: 17, j: 18 });
    expect(asked).toHaveLength(1);
    expect(asked[0].startsWith(OVERPASS_MIRRORS[1])).toBe(true);
  });

  it('asks for at most two squares at a time', async () => {
    let now = 0;
    let peak = 0;
    vi.stubGlobal('fetch', async () => {
      now++;
      peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5));
      now--;
      return { ok: true, status: 200, json: async () => sample };
    });
    await Promise.all(Array.from({ length: 9 }, (_, k) => fetchCell({ i: 100 + k, j: 200 })));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('does not push a server to the back just because it said "too fast"', async () => {
    const asked: string[] = [];
    let n = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      if (n++ === 0) throw new TypeError('Failed to fetch');
      return { ok: true, status: 200, json: async () => sample };
    });
    await fetchCell({ i: 301, j: 1 }); // first server refuses, second answers
    asked.length = 0;
    await fetchCell({ i: 302, j: 1 });
    expect(asked[0].startsWith(OVERPASS_MIRRORS[1])).toBe(true); // the one that answered last goes first
    clearRoadCache();
    n = 0;
    asked.length = 0;
    await fetchCell({ i: 303, j: 1 }); // refusal again, served by the second
    await fetchCell({ i: 304, j: 1 });
    expect(asked.filter((u) => u.startsWith(OVERPASS_MIRRORS[0])).length).toBeLessThanOrEqual(1);
  });
});
