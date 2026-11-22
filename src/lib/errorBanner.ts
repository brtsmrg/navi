/**
 * Phones have no console. If anything throws, show the message on screen (tap to dismiss)
 * so a screenshot of it says what went wrong. Plain DOM, so it still works if React itself fails.
 */
const seen = new Set<string>();
export function showProblem(what: string, err: unknown): void {
  {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const key = `${what}|${msg}`;
    if (seen.has(key) || /ResizeObserver loop/.test(msg)) return;
    seen.add(key);
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;left:8px;right:8px;top:max(8px,env(safe-area-inset-top));z-index:99999;background:#b4121f;color:#fff;font:14px/1.35 system-ui,sans-serif;padding:12px 14px;border-radius:12px;box-shadow:0 6px 24px #000a';
    const stack = err instanceof Error && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : '';
    box.textContent = `Navi hit a problem (${what}): ${msg} ${stack}`.slice(0, 420) + '  Tap to hide.';
    box.onclick = () => box.remove();
    document.body.appendChild(box);
  }
}

export function installErrorBanner(): void {
  window.addEventListener('error', (e) => showProblem('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => showProblem('promise', e.reason));
}
