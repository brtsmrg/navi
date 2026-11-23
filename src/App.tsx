import { useEffect } from 'react';
import { Hud } from '@/components/Hud';
import { MapView } from '@/components/MapView';
import { Shell } from '@/components/Shell';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Splash } from '@/components/Splash';
import { openSharedRoute } from '@/lib/flow';
import { useApp, useRideStore } from '@/lib/store';
import { parseShareHash } from '@/providers/share';

export default function App() {
  const active = useRideStore((s) => s.active);
  const theme = useApp((s) => s.settings.theme);

  // light, dark, or follow the phone
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const light = theme === 'light' || (theme === 'auto' && mq.matches);
      document.documentElement.dataset.theme = light ? 'light' : 'dark';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#eef0f3' : '#000000');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // open a shared route link (#r=...): routing runs here, nothing is stored on a server
  useEffect(() => {
    if (!/[#&]r=/.test(location.hash)) return;
    const p = parseShareHash(location.hash);
    // drop the link from the address bar so a refresh does not replace later changes
    history.replaceState(null, '', location.pathname + location.search);
    if (!p) {
      useApp.getState().setPlan({ err: 'That shared link is damaged or too long, so Navi could not open it. Ask for a new one.' });
      return;
    }
    void openSharedRoute(p);
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView />
      {active ? <Hud /> : <Shell />}
      <SettingsDialog />
      <Splash />
    </div>
  );
}
