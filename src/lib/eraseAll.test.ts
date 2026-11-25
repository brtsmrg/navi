import { describe, expect, it } from 'vitest';
import { clearNaviKeys, NAVI_CACHES, NAVI_DATABASES, type KeyStore } from './eraseAll';

function fake(entries: Record<string, string>): KeyStore & { keys: () => string[] } {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

describe('erase everything', () => {
  it('removes only keys that start with navi.', () => {
    const s = fake({ 'navi.settings.v2': '{}', 'navi.library.v1': '{}', 'navi.game.best': '9', 'other-app.theme': 'dark', naviX: '1' });
    expect(clearNaviKeys(s)).toBe(3);
    expect(s.keys().sort()).toEqual(['naviX', 'other-app.theme']);
  });
  it('is safe on an empty store', () => {
    expect(clearNaviKeys(fake({}))).toBe(0);
  });
  it('names every database and cache the app creates', () => {
    expect([...NAVI_DATABASES]).toEqual(['navi-roads', 'navi-premium-voice']);
    expect([...NAVI_CACHES]).toEqual(['navi-kokoro-1']);
  });
});
