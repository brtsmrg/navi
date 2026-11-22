import { useState } from 'react';
import { Briefcase, Home, Pencil, Plus, Star, Trash2, Route as RouteIcon } from 'lucide-react';
import { chooseDestination, fmtDistance, loadTrip } from '@/lib/flow';
import { useLibrary, type Fav } from '@/lib/library';
import { useApp } from '@/lib/store';
import type { Place } from '@/providers/photon';
import { PlaceRow, SearchBox } from './SearchBox';

function Heading({ children }: { children: string }) {
  return <h2 className="mb-1 mt-5 px-1 font-display text-xl font-semibold text-mute first:mt-0">{children}</h2>;
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-raise hover:text-ink">
      {children}
    </button>
  );
}

function Slot({ kind }: { kind: 'home' | 'work' }) {
  const { home, work, setHome, setWork } = useLibrary();
  const [editing, setEditing] = useState(false);
  const cur = kind === 'home' ? home : work;
  const set = kind === 'home' ? setHome : setWork;
  const Icon = kind === 'home' ? Home : Briefcase;
  const label = kind === 'home' ? 'Home' : 'Work';
  if (editing) {
    return (
      <div className="py-1">
        <SearchBox placeholder={`Set ${label.toLowerCase()} address`} autoFocus compact onPick={(p: Place) => { set(p); setEditing(false); }} />
        <button className="mt-1 px-2 text-sm text-mute" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    );
  }
  if (!cur) {
    return <PlaceRow icon={<Icon size={18} />} title={`Add ${label.toLowerCase()}`} subtitle="One tap to route there later" onClick={() => setEditing(true)} right={<span className="grid size-11 place-items-center text-mute"><Plus size={18} /></span>} />;
  }
  return (
    <PlaceRow
      icon={<Icon size={18} />}
      title={label}
      subtitle={cur.place.title}
      onClick={() => void chooseDestination(cur.place)}
      right={
        <>
          <IconBtn label={`Change ${label.toLowerCase()}`} onClick={() => setEditing(true)}><Pencil size={17} /></IconBtn>
          <IconBtn label={`Remove ${label.toLowerCase()}`} onClick={() => set(null)}><Trash2 size={17} /></IconBtn>
        </>
      }
    />
  );
}

function FavRow({ f }: { f: Fav }) {
  const { renameFav, removeFav } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.label);
  if (editing) {
    return (
      <form className="flex items-center gap-2 py-1" onSubmit={(e) => { e.preventDefault(); renameFav(f.id, name); setEditing(false); }}>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="min-h-12 min-w-0 flex-1 rounded-xl bg-raise px-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-brand" />
        <button type="submit" className="min-h-12 rounded-xl bg-brand px-4 font-medium text-white">Save</button>
      </form>
    );
  }
  return (
    <PlaceRow
      icon={<Star size={18} fill="currentColor" className="text-sev3" />}
      title={f.label}
      subtitle={f.place.subtitle || f.place.title}
      onClick={() => void chooseDestination(f.place)}
      right={
        <>
          <IconBtn label={`Rename ${f.label}`} onClick={() => { setName(f.label); setEditing(true); }}><Pencil size={17} /></IconBtn>
          <IconBtn label={`Remove ${f.label} from favourites`} onClick={() => removeFav(f.id)}><Trash2 size={17} /></IconBtn>
        </>
      }
    />
  );
}

export function SavedTab() {
  const { favs, trips, pinTrip } = useLibrary();
  const units = useApp((s) => s.settings.units);
  const pinned = trips.filter((t) => t.pinned);
  return (
    <div className="pb-4">
      <Heading>Home and work</Heading>
      <Slot kind="home" />
      <Slot kind="work" />

      <Heading>Favourites</Heading>
      {favs.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-mute">Tap the star on any place to keep it here.</p>
      ) : (
        favs.map((f) => <FavRow key={f.id} f={f} />)
      )}

      <Heading>Saved routes</Heading>
      {pinned.length === 0 ? (
        <p className="px-2 py-3 text-[15px] text-mute">Plan a route, then tap the bookmark to keep it here.</p>
      ) : (
        pinned.map((t) => (
          <PlaceRow
            key={t.id}
            icon={<RouteIcon size={18} />}
            title={t.name ?? `To ${t.to.title}`}
            subtitle={`${t.from.title} → ${t.to.title} · ${fmtDistance(t.distanceM, units)} · ${t.corners} corners`}
            onClick={() => void loadTrip(t)}
            right={<IconBtn label="Remove saved route" onClick={() => pinTrip(t.id, false)}><Trash2 size={17} /></IconBtn>}
          />
        ))
      )}
    </div>
  );
}
