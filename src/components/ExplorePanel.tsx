import { useRef, useState } from 'react';
import { Bookmark, Briefcase, ChevronDown, ChevronLeft, Clock, Coffee, Fuel, Home, MapPin, ParkingSquare, Pencil, Play, Plus, Share2, Star, Upload, UtensilsCrossed, Wand2, X, Zap } from 'lucide-react';
import { generateStage, type Stage } from '@/core';
import { parseGpx } from '@/providers/gpx';
import { buildShareUrl } from '@/providers/share';
import { useEdits } from '@/lib/edits';
import { chooseDestination, clearRoute, loadSampleRoad, SAMPLE_FROM, fmtArrival, fmtDistance, fmtDuration, locateHere, planRoute } from '@/lib/flow';
import { useLibrary } from '@/lib/library';
import { useApp } from '@/lib/store';
import { cn, SEV_COLOR } from '@/lib/cn';
import { startRide } from '@/ride/controller';
import { CATEGORIES, searchNearby, type Category, type NearbyPlace, type Place } from '@/providers/photon';
import { NotesList } from './NotesList';
import { SafetyGate } from './SafetyGate';
import { PlaceRow, SearchBox } from './SearchBox';
import { PrepareVoice } from './PrepareVoice';
import { Button } from './ui';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 text-center">
      <div className="font-display text-[26px] font-semibold leading-none">{value}</div>
      <div className="mt-1 text-xs text-mute">{label}</div>
    </div>
  );
}

function Chips({ onChange }: { onChange: () => void }) {
  const avoid = useApp((s) => s.settings.avoid);
  const set = useApp((s) => s.set);
  const items: [keyof typeof avoid, string][] = [['highways', 'Avoid motorways'], ['tolls', 'Avoid tolls'], ['ferries', 'Avoid ferries']];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Route options">
      {items.map(([k, label]) => (
        <button
          key={k}
          aria-pressed={avoid[k]}
          onClick={() => { set({ avoid: { ...avoid, [k]: !avoid[k] } }); onChange(); }}
          className={cn('min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ring-1 transition', avoid[k] ? 'bg-brand text-white ring-brand' : 'bg-raise text-mute ring-line hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StatsBlock({ stage }: { stage: Stage }) {
  const units = useApp((s) => s.settings.units);
  const st = stage.stats;
  const dur = stage.route.duration;
  const total = st.bySeverity.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="rounded-2xl bg-bg p-3">
      <div className="grid grid-cols-4 gap-2">
        <Stat value={dur ? fmtDuration(dur).replace(' min', 'm').replace(' h ', 'h ') : '–'} label={dur ? `arrive ${fmtArrival(dur)}` : 'time'} />
        <Stat value={fmtDistance(st.distanceM, units)} label="distance" />
        <Stat value={String(st.cornerCount)} label="corners" />
        <Stat value={String(Math.round(st.twistScore))} label="twist score" />
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line" role="img" aria-label="Corner mix from tight to flat">
        {st.bySeverity.map((n, i) => (
          <div key={i} style={{ width: `${(n / total) * 100}%`, background: SEV_COLOR[i + 1] }} />
        ))}
      </div>
    </div>
  );
}

const CAT_ICON: Record<string, React.ReactNode> = {
  fuel: <Fuel size={18} />,
  charging: <Zap size={18} />,
  food: <UtensilsCrossed size={18} />,
  coffee: <Coffee size={18} />,
  parking: <ParkingSquare size={18} />,
};

/** "Fuel near me" and friends: nearest first, one tap to route. */
function Nearby() {
  const units = useApp((s) => s.settings.units);
  const [cat, setCat] = useState<Category | null>(null);
  const [items, setItems] = useState<NearbyPlace[]>([]);
  const [state, setState] = useState<'idle' | 'busy' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const run = async (c: Category) => {
    setCat(c);
    setItems([]);
    setState('busy');
    try {
      const here = await locateHere();
      setItems(await searchNearby(c, here.lngLat));
      setState('idle');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Search is unavailable right now.');
      setState('err');
    }
  };

  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-xl font-semibold text-mute">Near me</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Places near me">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            aria-pressed={cat?.id === c.id}
            onClick={() => void run(c)}
            className={cn('flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 transition', cat?.id === c.id ? 'bg-brand text-white ring-brand' : 'bg-raise text-ink ring-line')}
          >
            {CAT_ICON[c.id]} {c.label}
          </button>
        ))}
      </div>
      {state === 'busy' && <p className="px-2 pt-3 text-sm text-mute">Looking nearby…</p>}
      {state === 'err' && <p role="alert" className="px-2 pt-3 text-sm text-sev3">{msg}</p>}
      {state === 'idle' && cat && items.length === 0 && <p className="px-2 pt-3 text-sm text-mute">Nothing found nearby.</p>}
      {items.map((p) => (
        <PlaceRow key={p.id} icon={<MapPin size={18} />} title={p.title} subtitle={`${fmtDistance(p.distanceM, units)} away${p.subtitle ? ` · ${p.subtitle}` : ''}`} onClick={() => void chooseDestination(p)} />
      ))}
    </section>
  );
}

function HomeView() {
  const { home, work, favs, recents } = useLibrary();
  const setTab = useApp((s) => s.setTab);
  const setStage = useApp((s) => s.setStage);
  const plan = useApp((s) => s.plan);
  const setPlan = useApp((s) => s.setPlan);
  const file = useRef<HTMLInputElement>(null);

  const onGpx = async (f: File | undefined) => {
    if (!f) return;
    setPlan({ err: '' });
    try {
      setStage(generateStage(parseGpx(await f.text())));
    } catch (e) {
      setPlan({ err: e instanceof Error ? e.message : 'That file could not be read as a route.' });
    }
  };

  const quick = [
    { key: 'home', label: 'Home', icon: <Home size={20} />, place: home?.place },
    { key: 'work', label: 'Work', icon: <Briefcase size={20} />, place: work?.place },
    { key: 'fav', label: 'Favourites', icon: <Star size={20} />, place: undefined },
  ];

  return (
    <div className="space-y-4 pb-4">
      <SearchBox placeholder="Where to?" onPick={(p) => void chooseDestination(p)} />
      <div className="grid grid-cols-3 gap-2">
        {quick.map((q) => (
          <button
            key={q.key}
            onClick={() => (q.place ? void chooseDestination(q.place) : setTab('saved'))}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl bg-raise text-sm active:scale-[0.98]"
          >
            {q.icon}
            <span>{q.place || q.key === 'fav' ? q.label : `Set ${q.label.toLowerCase()}`}</span>
            {q.key === 'fav' && <span className="-mt-1 text-xs text-mute">{favs.length} saved</span>}
          </button>
        ))}
      </div>

      {recents.length > 0 && (
        <section>
          <h2 className="mb-1 px-1 font-display text-xl font-semibold text-mute">Recent</h2>
          {recents.slice(0, 4).map((r) => (
            <PlaceRow key={r.place.id} icon={<Clock size={18} />} title={r.place.title} subtitle={r.place.subtitle} onClick={() => void chooseDestination(r.place)} />
          ))}
        </section>
      )}

      <Nearby />

      {plan.busy && <p className="rounded-xl bg-bg p-3 text-sm text-mute">Finding that spot…</p>}
      {plan.err && <p role="alert" className="rounded-xl bg-sev1/15 p-3 text-sm text-sev2">{plan.err}</p>}

      <section>
        <h2 className="mb-2 px-1 font-display text-xl font-semibold text-mute">No destination yet?</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="raise" onClick={() => void loadSampleRoad()}>
            <Wand2 size={18} /> Try a real twisty road
          </Button>
          <Button variant="raise" onClick={() => file.current?.click()}>
            <Upload size={18} /> Load a GPX file
          </Button>
          <input ref={file} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden" onChange={(e) => { void onGpx(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </section>
      <p className="pb-2 text-center text-xs text-mute">Navi build {__BUILD__}</p>
    </div>
  );
}

function FromEditor() {
  const { from, setFrom } = useApp();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div>
        <SearchBox placeholder="Start from…" autoFocus allowHere compact onPick={(p: Place) => { setEditing(false); setFrom(p); void planRoute(); }} />
        <button className="mt-1 min-h-11 px-2 text-sm text-mute" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-bg px-3 text-left">
      <span className="min-w-0">
        <span className="block text-xs text-mute">From</span>
        <span className="block truncate text-[15px]">{from?.title ?? 'Choose a start'}</span>
      </span>
      <Pencil size={16} className="shrink-0 text-mute" />
    </button>
  );
}

function Stops() {
  const { via, setVia } = useApp();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      {via.map((v, i) => (
        <div key={`${v.id}${i}`} className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-bg px-3">
          <span className="min-w-0">
            <span className="block text-xs text-mute">Stop {i + 1}</span>
            <span className="block truncate text-[15px]">{v.title}</span>
          </span>
          <button aria-label={`Remove stop ${i + 1}`} className="grid size-11 place-items-center rounded-full text-mute" onClick={() => { setVia(via.filter((_, j) => j !== i)); void planRoute(); }}>
            <X size={18} />
          </button>
        </div>
      ))}
      {adding ? (
        <div>
          <SearchBox placeholder="Add a stop" autoFocus compact onPick={(p: Place) => { setAdding(false); setVia([...via, p]); void planRoute(); }} />
          <button className="mt-1 min-h-11 px-2 text-sm text-mute" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        via.length < 3 && (
          <button onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-2 px-1 text-[15px] text-mute hover:text-ink">
            <Plus size={18} /> Add a stop
          </button>
        )
      )}
    </div>
  );
}

function RouteView() {
  const { stage, from, to, via, plan, settings, tripId } = useApp();
  const set = useApp((s) => s.set);
  const favs = useLibrary((s) => s.favs);
  const trips = useLibrary((s) => s.trips);
  const { toggleFav, pinTrip, markStarted } = useLibrary();
  const [gate, setGate] = useState<null | (() => void)>(null);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState('');
  const notice = useApp((s) => s.notice);
  const setNotice = useApp((s) => s.setNotice);
  const [notes, setNotes] = useState(false);
  if (!stage) return null;

  const trip = trips.find((t) => t.id === tripId);
  const isDemoRoad = from?.id === SAMPLE_FROM.id;
  const isFav = to ? favs.some((f) => f.place.id === to.id || (Math.abs(f.place.lngLat[0] - to.lngLat[0]) < 1e-4 && Math.abs(f.place.lngLat[1] - to.lngLat[1]) < 1e-4)) : false;
  const guarded = (go: () => void) => (settings.safetyAccepted ? go() : setGate(() => go));
  const go = (kind: 'gps' | 'demo') =>
    guarded(() => {
      if (tripId) markStarted(tripId);
      const countdownSec = settings.stageView ? 5 : 0;
      startRide(stage, kind === 'gps' ? { kind: 'gps', countdownSec } : { kind: 'demo', cruiseKmh: 90, warp: 1, countdownSec });
    });

  const share = async () => {
    if (!from || !to || !stage) return;
    const edits = stage.key ? useEdits.getState().byRoute[stage.key] : undefined;
    const url = buildShareUrl(location.origin + location.pathname.replace(/\/$/, ''), {
      waypoints: [from.lngLat, ...via.map((v) => v.lngLat), to.lngLat],
      dialect: settings.dialect,
      names: [from.title, to.title],
      edits,
      key: stage.key,
    });
    const text = `${from.title} to ${to.title}: ${fmtDistance(stage.stats.distanceM, settings.units)}, ${stage.stats.cornerCount} corners, with pacenotes in Navi.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Navi route', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setManual('');
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // share sheet dismissed
      setManual(url); // the phone blocked copying: show the link so it can be held and copied
    }
  };

  return (
    <div className="space-y-3 pb-4">
      {notice && (
        <p role="status" className="flex items-start justify-between gap-2 rounded-xl bg-raise p-3 text-sm">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice('')} className="-m-2 grid size-11 shrink-0 place-items-center text-mute"><X size={16} /></button>
        </p>
      )}
      <div className="flex items-center gap-1">
        <button aria-label="Back" onClick={clearRoute} className="grid size-11 shrink-0 place-items-center rounded-full bg-raise">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1 px-2">
          <div className="truncate font-display text-2xl font-semibold leading-tight">{to ? to.title : 'Route'}</div>
          {to?.subtitle && <div className="truncate text-sm text-mute">{to.subtitle}</div>}
        </div>
        {to && (
          <button aria-label={isFav ? 'Remove from favourites' : 'Save to favourites'} aria-pressed={isFav} onClick={() => toggleFav(to)} className="grid size-11 shrink-0 place-items-center rounded-full bg-raise">
            <Star size={20} fill={isFav ? 'currentColor' : 'none'} className={isFav ? 'text-sev3' : ''} />
          </button>
        )}
      </div>

      {plan.busy && <p className="rounded-xl bg-bg p-3 text-sm text-mute">Reading the road…</p>}
      <StatsBlock stage={stage} />
      <PrepareVoice stage={stage} />

      {isDemoRoad ? (
        <>
          <Button variant="primary" className="w-full bg-go text-dark hover:bg-go/90" onClick={() => go('demo')}>
            <Play size={18} fill="currentColor" /> Watch the demo drive
          </Button>
          <p className="px-1 text-sm text-mute">This is a real road far from you (the Tail of the Dragon, USA), so GPS has nothing to follow. The demo drives it for you and calls every corner.</p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Button variant="primary" className="bg-go text-dark hover:bg-go/90" onClick={() => go('gps')}>
              <Play size={18} fill="currentColor" /> Start with GPS
            </Button>
            {trip && (
              <Button variant="raise" aria-label={trip.pinned ? 'Unsave route' : 'Save route'} onClick={() => pinTrip(trip.id, !trip.pinned)}>
                <Bookmark size={18} fill={trip.pinned ? 'currentColor' : 'none'} className={trip.pinned ? 'text-brand' : ''} />
              </Button>
            )}
            {from && to && (
              <Button variant="raise" aria-label="Share route link" onClick={share}>
                <Share2 size={18} /> {copied ? 'Link copied' : ''}
              </Button>
            )}
          </div>
          {manual && (
            <div className="space-y-1">
              <p className="px-1 text-sm text-mute">This phone would not copy it for you. Press and hold the link, choose Select all, then Copy.</p>
              <input readOnly value={manual} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="min-h-12 w-full rounded-xl bg-bg px-3 text-sm text-ink ring-1 ring-line" />
            </div>
          )}
          <Button variant="raise" className="w-full" onClick={() => go('demo')}>
            Watch a demo drive (no GPS)
          </Button>
        </>
      )}

      {from && to && (
        <div className="space-y-2">
          <FromEditor />
          <Stops />
          <Chips onChange={() => void planRoute()} />
        </div>
      )}

      <button onClick={() => setNotes(!notes)} aria-expanded={notes} className="flex min-h-12 w-full items-center justify-between rounded-xl bg-bg px-3 text-[15px]">
        <span>Pacenotes ({stage.notes.filter((n) => n.kind !== 'finish').length})</span>
        <ChevronDown size={18} className={cn('transition', notes && 'rotate-180')} />
      </button>
      {notes && <NotesList stage={stage} />}

      <SafetyGate
        open={gate !== null}
        onAccept={() => {
          set({ safetyAccepted: true });
          const g = gate;
          setGate(null);
          g?.();
        }}
      />
    </div>
  );
}

function PendingView() {
  const { to, from, plan } = useApp();
  const favs = useLibrary((s) => s.favs);
  const { toggleFav } = useLibrary();
  if (!to) return null;
  const isFav = favs.some((f) => f.place.id === to.id);
  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center gap-1">
        <button aria-label="Back" onClick={clearRoute} className="grid size-11 shrink-0 place-items-center rounded-full bg-raise">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1 px-2">
          <div className="truncate font-display text-2xl font-semibold leading-tight">{to.title}</div>
          {to.subtitle && <div className="truncate text-sm text-mute">{to.subtitle}</div>}
        </div>
        <button aria-label={isFav ? 'Remove from favourites' : 'Save to favourites'} aria-pressed={isFav} onClick={() => toggleFav(to)} className="grid size-11 shrink-0 place-items-center rounded-full bg-raise">
          <Star size={20} fill={isFav ? 'currentColor' : 'none'} className={isFav ? 'text-sev3' : ''} />
        </button>
      </div>
      {plan.busy && <p className="rounded-xl bg-bg p-3 text-sm text-mute">Reading the road…</p>}
      {plan.err && <p role="alert" className="rounded-xl bg-sev1/15 p-3 text-sm text-sev2">{plan.err}</p>}
      {!from && !plan.busy && (
        <div>
          <p className="mb-2 px-1 text-sm text-mute">Where are you starting from?</p>
          <SearchBox placeholder="Start from…" allowHere compact onPick={(p: Place) => { useApp.getState().setFrom(p); void planRoute(); }} />
        </div>
      )}
      {from && !plan.busy && (
        <>
          <FromEditor />
          <Chips onChange={() => void planRoute()} />
          <Button variant="primary" className="w-full" onClick={() => void planRoute()}>Try again</Button>
        </>
      )}
    </div>
  );
}

export function ExplorePanel() {
  const stage = useApp((s) => s.stage);
  const to = useApp((s) => s.to);
  if (stage) return <RouteView />;
  if (to) return <PendingView />;
  return <HomeView />;
}
