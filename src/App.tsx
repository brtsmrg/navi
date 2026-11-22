import { useEffect } from 'react';
import { Hud } from '@/components/Hud';
import { MapView } from '@/components/MapView';
import { Shell } from '@/components/Shell';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Splash } from '@/components/Splash';
import { planWaypoints } from '@/lib/plan';
import { useApp, useRideStore } from '@/lib/store';
import { parseShareHash } from '@/providers/share';

export default function App() {
  const active = useRideStore((s) => s.active);
  const setStage = useApp((s) => s.setStage);

  // open a shared route link (#r=…): routing runs here, nothing is stored on a server
  useEffect(() => {
    const p = parseShareHash(location.hash);
    if (!p) return;
    const ac = new AbortController();
    planWaypoints(p.waypoints, ac.signal).then(setStage).catch(() => undefined);
    return () => ac.abort();
  }, [setStage]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView />
      {active ? <Hud /> : <Shell />}
      <SettingsDialog />
      <Splash />
    </div>
  );
}
