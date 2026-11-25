import { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { useApp } from '@/lib/store';
import { SearchBox } from './SearchBox';

/** Optional start point, picked by hand. Fun loop, Near me, Game mode and saved roads use it instead of GPS. */
export function StartFrom() {
  const anchor = useApp((s) => s.anchor);
  const setAnchor = useApp((s) => s.setAnchor);
  const blocked = useApp((s) => s.locationBlocked);
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-xl font-semibold text-mute">Start point</h2>
      {anchor ? (
        <div className="flex items-center gap-2 rounded-2xl bg-raise px-3">
          <MapPin size={18} className="shrink-0 text-brand" />
          <div className="min-w-0 flex-1 py-2">
            <div className="truncate">{anchor.title}</div>
            <div className="text-xs text-mute">Fun loop, Near me, Game mode and saved roads start here, not at your GPS.</div>
          </div>
          <button aria-label="Use my location again" className="grid min-h-11 min-w-11 place-items-center text-mute" onClick={() => setAnchor(null)}>
            <X size={20} />
          </button>
        </div>
      ) : open || blocked ? (
        <div className="space-y-1">
          <SearchBox placeholder="Search a town or road to start from" onPick={(p) => { setAnchor(p); setOpen(false); }} />
          <p className="px-1 text-sm text-mute">Used instead of GPS for Fun loop, Near me, Game mode and saved roads.</p>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-raise px-3 text-left">
          <MapPin size={18} className="text-mute" />
          <span className="flex-1">My location</span>
          <span className="text-sm text-brand-text">Change</span>
        </button>
      )}
    </section>
  );
}
