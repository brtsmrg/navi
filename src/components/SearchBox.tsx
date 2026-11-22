import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Briefcase, Clock, Home, LocateFixed, MapPin, Search, Star, X } from 'lucide-react';
import { searchPlaces, type Place } from '@/providers/photon';
import { HERE } from '@/lib/flow';
import { useLibrary } from '@/lib/library';
import { useApp } from '@/lib/store';

export function PlaceRow({ icon, title, subtitle, onClick, right }: { icon: ReactNode; title: string; subtitle?: string; onClick: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onClick} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left hover:bg-raise active:bg-raise">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-raise text-mute">{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-[16px]">{title}</span>
          {subtitle && <span className="block truncate text-sm text-mute">{subtitle}</span>}
        </span>
      </button>
      {right}
    </div>
  );
}

interface Sugg {
  key: string;
  icon: ReactNode;
  place: Place;
  title: string;
  subtitle?: string;
}

/** Search that starts with what you already use (Home, Work, favourites, recents) and falls back to the open Photon search. */
export function SearchBox({
  placeholder,
  onPick,
  autoFocus = false,
  allowHere = false,
  compact = false,
}: {
  placeholder: string;
  onPick: (p: Place) => void;
  autoFocus?: boolean;
  allowHere?: boolean;
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(autoFocus);
  const [remote, setRemote] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const userPos = useApp((s) => s.userPos);
  const { home, work, favs, recents } = useLibrary();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setRemote([]);
      setErr('');
      return;
    }
    const ac = new AbortController();
    timer.current = setTimeout(async () => {
      setBusy(true);
      setErr('');
      try {
        setRemote(await searchPlaces(q.trim(), userPos ?? undefined, ac.signal));
      } catch {
        if (!ac.signal.aborted) setErr('Search is unavailable right now. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer.current);
      ac.abort();
    };
  }, [q, userPos]);

  const local = useMemo<Sugg[]>(() => {
    const out: Sugg[] = [];
    if (allowHere) out.push({ key: 'here', icon: <LocateFixed size={18} />, place: HERE, title: 'My location' });
    if (home) out.push({ key: 'home', icon: <Home size={18} />, place: home.place, title: 'Home', subtitle: home.place.title });
    if (work) out.push({ key: 'work', icon: <Briefcase size={18} />, place: work.place, title: 'Work', subtitle: work.place.title });
    for (const f of favs) out.push({ key: `f${f.id}`, icon: <Star size={18} fill="currentColor" />, place: f.place, title: f.label, subtitle: f.place.subtitle || f.place.title });
    for (const r of recents.slice(0, 8)) out.push({ key: `r${r.place.id}`, icon: <Clock size={18} />, place: r.place, title: r.place.title, subtitle: r.place.subtitle });
    return out;
  }, [allowHere, home, work, favs, recents]);

  const needle = q.trim().toLowerCase();
  const list: Sugg[] = needle
    ? [
        ...local.filter((l) => l.key !== 'here' && `${l.title} ${l.subtitle ?? ''}`.toLowerCase().includes(needle)),
        ...remote.map((p) => ({ key: `p${p.id}`, icon: <MapPin size={18} />, place: p, title: p.title, subtitle: p.subtitle })),
      ]
    : focused
      ? local.slice(0, compact ? 5 : 9)
      : [];
  // the same place can come from saved and from search: show it once
  const seen = new Set<string>();
  const unique = list.filter((l) => {
    const k = `${l.place.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const pick = (p: Place) => {
    setQ('');
    setRemote([]);
    setFocused(false);
    onPick(p);
  };

  return (
    <div>
      <div className="flex min-h-14 items-center gap-3 rounded-2xl bg-raise px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
        <Search size={20} className="shrink-0 text-mute" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoFocus={autoFocus}
          className="min-h-14 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-mute"
        />
        {(q || focused) && (
          <button aria-label="Clear search" className="grid size-10 place-items-center rounded-full text-mute" onClick={() => { setQ(''); setRemote([]); setFocused(false); }}>
            <X size={18} />
          </button>
        )}
      </div>
      {busy && <div className="px-2 pt-2 text-sm text-mute">Searching…</div>}
      {err && <div role="alert" className="px-2 pt-2 text-sm text-sev3">{err}</div>}
      {needle.length >= 3 && !busy && !err && unique.length === 0 && <div className="px-2 pt-3 text-sm text-mute">No places found. Try a street and city.</div>}
      {unique.length > 0 && (
        <ul className="mt-2">
          {unique.map((l) => (
            <li key={l.key}>
              <PlaceRow icon={l.icon} title={l.title} subtitle={l.subtitle} onClick={() => pick(l.place)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
