import { useApp } from './store';

/**
 * The home voice server on the driver's PC shows a QR code that opens Navi with `#home=<code>`. The code holds the
 * server's secure address and a private token. It is read here, saved in this phone's settings, and removed from the
 * address bar. Only secure addresses on trycloudflare.com are accepted.
 */
export function parseHomeCode(code: string): { url: string; token: string } | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { u?: unknown; t?: unknown };
    const url = String(json.u ?? '');
    const token = String(json.t ?? '');
    if (!/^https:\/\/[a-z0-9-]{3,80}\.trycloudflare\.com$/.test(url)) return null;
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(token)) return null;
    return { url, token };
  } catch {
    return null;
  }
}

/** Run once at start. Returns true when a home voice link was found and saved. */
export function consumeHomeLink(): boolean {
  if (typeof location === 'undefined') return false;
  const m = /[#&]home=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return false;
  const got = parseHomeCode(m[1]);
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* ignore */
  }
  if (!got) {
    useApp.getState().setNotice('That home voice code was not valid. Scan the code on your PC again.');
    return false;
  }
  const app = useApp.getState();
  app.set({ voiceEngine: 'home', homeUrl: got.url, homeToken: got.token });
  app.setNotice('Home voice connected. Open a road and tap Prepare voice.');
  return true;
}
