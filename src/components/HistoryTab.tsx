import { Bookmark, Clock, MapPin, Trash2 } from 'lucide-react';
import { fmtDistance, fmtDuration, loadTrip, chooseDestination } from '@/lib/flow';
import { useLibrary, type Trip } from '@/lib/library';
import { useApp } from '@/lib/store';
import { PlaceRow } from './SearchBox';

function dayLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function HistoryTab() {
  const { trips, recents, pinTrip, removeTrip, clearTrips, removeRecent, clearRecents } = useLibrary();
  const units = useApp((s) => s.settings.units);

  const groups: { label: string; items: Trip[] }[] = [];
  for (const t of trips) {
    const label = dayLabel(t.at);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <div className="pb-4">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="font-display text-xl font-semibold text-mute">Directions history</h2>
        {trips.some((t) => !t.pinned) && (
          <button className="min-h-11 px-2 text-sm text-mute hover:text-ink" onClick={clearTrips}>Clear</button>
        )}
      </div>
      {trips.length === 0 && <p className="px-2 py-3 text-[15px] text-mute">Routes you plan show up here, so you can run them again in one tap.</p>}
      {groups.map((g) => (
        <section key={g.label}>
          <h3 className="mt-3 px-2 text-sm text-mute">{g.label}</h3>
          {g.items.map((t) => (
            <PlaceRow
              key={t.id}
              icon={<Clock size={18} />}
              title={t.name ?? `To ${t.to.title}`}
              subtitle={`From ${t.from.title} · ${fmtDistance(t.distanceM, units)}${t.durationS ? ` · ${fmtDuration(t.durationS)}` : ''}${t.started ? ' · driven' : ''}`}
              onClick={() => void loadTrip(t)}
              right={
                <>
                  <button aria-label={t.pinned ? 'Unsave route' : 'Save route'} onClick={() => pinTrip(t.id, !t.pinned)} className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-raise">
                    <Bookmark size={17} fill={t.pinned ? 'currentColor' : 'none'} className={t.pinned ? 'text-brand' : ''} />
                  </button>
                  <button aria-label="Delete from history" onClick={() => removeTrip(t.id)} className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-raise">
                    <Trash2 size={17} />
                  </button>
                </>
              }
            />
          ))}
        </section>
      ))}

      <div className="mb-1 mt-6 flex items-center justify-between px-1">
        <h2 className="font-display text-xl font-semibold text-mute">Recent searches</h2>
        {recents.length > 0 && <button className="min-h-11 px-2 text-sm text-mute hover:text-ink" onClick={clearRecents}>Clear</button>}
      </div>
      {recents.length === 0 && <p className="px-2 py-3 text-[15px] text-mute">Places you search for are listed here.</p>}
      {recents.slice(0, 15).map((r) => (
        <PlaceRow
          key={r.place.id}
          icon={<MapPin size={18} />}
          title={r.place.title}
          subtitle={r.place.subtitle}
          onClick={() => void chooseDestination(r.place)}
          right={
            <button aria-label={`Remove ${r.place.title}`} onClick={() => removeRecent(r.place.id)} className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-raise">
              <Trash2 size={17} />
            </button>
          }
        />
      ))}
    </div>
  );
}
