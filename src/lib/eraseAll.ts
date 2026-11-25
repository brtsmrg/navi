/**
 * "Erase everything on this phone": every key, database and cache Navi made.
 * Only Navi's own names are touched, because other sites on the same address (github.io) share the browser's storage.
 */
export const NAVI_DATABASES = ['navi-roads', 'navi-premium-voice'] as const;
export const NAVI_CACHES = ['navi-kokoro-1'] as const;

export interface KeyStore {
  readonly length: number;
  key(i: number): string | null;
  removeItem(k: string): void;
}

/** Remove every key that starts with "navi." and say how many went. */
export function clearNaviKeys(store: KeyStore): number {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith('navi.')) keys.push(k);
  }
  keys.forEach((k) => store.removeItem(k));
  return keys.length;
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const r = indexedDB.deleteDatabase(name);
    // an open connection blocks the delete until the page reloads, which we do next
    const t = setTimeout(resolve, 1500);
    const done = () => { clearTimeout(t); resolve(); };
    r.onsuccess = done;
    r.onerror = done;
  });
}

/** Wipe everything, then reload so no screen keeps an old copy in memory. */
export async function eraseEverything(): Promise<void> {
  try { clearNaviKeys(localStorage); } catch { /* storage blocked: nothing to erase */ }
  try { clearNaviKeys(sessionStorage); } catch { /* same */ }
  await Promise.all(NAVI_DATABASES.map(deleteDb));
  try {
    if (typeof caches !== 'undefined') await Promise.all(NAVI_CACHES.map((c) => caches.delete(c)));
  } catch { /* no cache storage */ }
  location.reload();
}
