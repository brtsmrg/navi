/**
 * A phone that installed Navi long ago can keep showing an old copy from its cache.
 * Compare the running build with the one on the server; if they differ, drop the caches and reload once.
 */
export async function ensureFresh(): Promise<void> {
  if (location.protocol !== 'https:') return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.txt?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = (await res.text()).trim();
    if (!latest || latest === __BUILD__ || latest.startsWith('<')) return;
    if (sessionStorage.getItem('navi.refreshed') === latest) return; // one try per version, never a loop
    sessionStorage.setItem('navi.refreshed', latest);
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
    for (const k of await caches.keys()) await caches.delete(k);
    location.reload();
  } catch {
    /* offline: keep what we have */
  }
}
