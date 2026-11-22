import { useEffect } from 'react';
import { Settings as Cog } from 'lucide-react';
import { Hud } from '@/components/Hud';
import { MapView } from '@/components/MapView';
import { PlanPanel } from '@/components/PlanPanel';
import { SettingsDialog } from '@/components/SettingsDialog';
import { planWaypoints } from '@/lib/plan';
import { useApp, useRideStore } from '@/lib/store';
import { parseShareHash } from '@/providers/share';

export default function App() {
  const active = useRideStore((s) => s.active);
  const setStage = useApp((s) => s.setStage);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);

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
      {active ? (
        <Hud />
      ) : (
        <>
          <PlanPanel />
          <button aria-label="Settings" onClick={() => setSettingsOpen(true)} className="safe-t absolute right-3 top-0 z-10 grid size-12 place-items-center rounded-full bg-panel/90 shadow-lg md:top-3">
            <Cog size={20} />
          </button>
        </>
      )}
      <SettingsDialog />
    </div>
  );
}
