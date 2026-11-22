/** Keep the screen on while riding. Re-acquires after the tab returns to the foreground. */
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let stopped = false;
  const acquire = async () => {
    try {
      if (!stopped && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    } catch {
      /* low battery or unsupported: ignore */
    }
  };
  const onVis = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  document.addEventListener('visibilitychange', onVis);
  void acquire();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVis);
    void lock?.release().catch(() => undefined);
  };
}
