import { useEffect, useRef, useState } from 'react';
import { LocateFixed, X } from 'lucide-react';
import { searchPlaces, type Place } from '@/providers/photon';
import { useApp } from '@/lib/store';

export function PlaceField({ label, value, onChange, allowLocate = false }: { label: string; value: Place | null; onChange: (p: Place | null) => void; allowLocate?: boolean }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const userPos = useApp((s) => s.userPos);
  const setUserPos = useApp((s) => s.setUserPos);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    abort.current?.abort();
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      abort.current = ac;
      setBusy(true);
      setErr('');
      try {
        setResults(await searchPlaces(q.trim(), userPos ?? undefined, ac.signal));
      } catch (e) {
        if (!ac.signal.aborted) setErr('Search is unavailable right now. Try again in a moment.');
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q, userPos]);

  const locate = () => {
    setErr('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos: [number, number] = [p.coords.longitude, p.coords.latitude];
        setUserPos(pos);
        onChange({ id: 'here', title: 'My location', subtitle: '', lngLat: pos });
      },
      () => setErr('Location is blocked. Allow it in your browser settings, or search for a place.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  if (value) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-bg px-3">
        <div className="min-w-0">
          <div className="text-xs text-mute">{label}</div>
          <div className="truncate text-[15px]">{value.title}</div>
        </div>
        <button aria-label={`Clear ${label}`} className="grid size-10 place-items-center rounded-full text-mute" onClick={() => { onChange(null); setQ(''); }}>
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={label}
          aria-label={label}
          enterKeyHint="search"
          autoComplete="off"
          className="min-h-12 flex-1 rounded-xl bg-bg px-3 text-[16px] outline-none placeholder:text-mute focus-visible:ring-2 focus-visible:ring-dirl"
        />
        {allowLocate && (
          <button aria-label="Use my location" onClick={locate} className="grid size-12 place-items-center rounded-xl bg-raise">
            <LocateFixed size={20} />
          </button>
        )}
      </div>
      {busy && <div className="px-1 pt-1 text-xs text-mute">Searching…</div>}
      {err && <div className="px-1 pt-1 text-sm text-sev3">{err}</div>}
      {results.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-xl bg-bg">
          {results.map((r) => (
            <li key={r.id}>
              <button className="block min-h-12 w-full px-3 py-2 text-left hover:bg-raise" onClick={() => { onChange(r); setResults([]); setQ(''); }}>
                <div className="text-[15px]">{r.title}</div>
                {r.subtitle && <div className="truncate text-xs text-mute">{r.subtitle}</div>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
