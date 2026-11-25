import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, type GeoJSONSource, type MapMouseEvent, type MapTouchEvent, type StyleSpecification } from 'maplibre-gl';
import { Hand, Pencil, X } from 'lucide-react';
import { CONFIG } from '@/providers/config';
import { BLANK_STYLE, loadStyle } from '@/lib/mapStyle';
import { useApp } from '@/lib/store';
import { areaPolygon, areaTiles, estimate, fmtSize, MAX_AREA_M, MIN_AREA_M, sizeFromDrag, type Area, type AreaKind } from '@/providers/area';
import { downloadTiles, packInfo } from '@/providers/roadPack';
import { SearchBox } from './SearchBox';
import { Button } from './ui';

const BIG_SAVE_TILES = 300;

/** Full-screen map: draw a circle or square, see what it will cost, save its roads on the phone. */
export function AreaPicker({ onClose }: { onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapGL | null>(null);
  const ready = useRef(false);
  const units = useApp((s) => s.settings.units);
  const [kind, setKind] = useState<AreaKind>('circle');
  const [mode, setMode] = useState<'draw' | 'move'>('draw');
  const [area, setArea] = useState<Area | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState('');
  const abort = useRef<AbortController | null>(null);
  // the latest values, for map event handlers that are set up once
  const live = useRef({ kind, mode });
  live.current = { kind, mode };

  useEffect(() => {
    if (!el.current) return;
    const ctl = new AbortController();
    const container = el.current;
    let m: MapGL | undefined;
    const st = useApp.getState();
    const start = st.anchor?.lngLat ?? st.userPos ?? [-75.7, 45.42];
    void loadStyle(CONFIG.mapStyle, ctl.signal)
      .then((style) => {
        if (ctl.signal.aborted) return;
        // loadStyle falls back to a plain background when the tile server cannot be reached
        if (style === BLANK_STYLE) setMsg('The map picture did not load, so the background is blank. You can still draw and save an area; check your signal for the map.');
        m = new MapGL({ container, style: style as StyleSpecification, center: start, zoom: 8, attributionControl: { compact: true } });
        map.current = m;
        const map1 = m;
        let center: [number, number] | null = null;
        const down = (e: MapMouseEvent | MapTouchEvent) => {
          if (live.current.mode !== 'draw') return;
          if ('points' in e && e.points.length !== 1) return;
          center = [e.lngLat.lng, e.lngLat.lat];
          setConfirming(false);
          setMsg('');
          setArea({ kind: live.current.kind, center, sizeM: MIN_AREA_M });
        };
        const move = (e: MapMouseEvent | MapTouchEvent) => {
          if (!center || live.current.mode !== 'draw') return;
          if ('points' in e && e.points.length !== 1) return;
          const c = center;
          setArea({ kind: live.current.kind, center: c, sizeM: sizeFromDrag(live.current.kind, c, [e.lngLat.lng, e.lngLat.lat]) });
        };
        const up = () => {
          center = null;
        };
        map1.on('mousedown', down);
        map1.on('touchstart', down);
        map1.on('mousemove', move);
        map1.on('touchmove', move);
        map1.on('mouseup', up);
        map1.on('touchend', up);
        map1.on('touchcancel', up);
        map1.on('load', () => {
          map1.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map1.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#e41626', 'fill-opacity': 0.18 } });
          map1.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#e41626', 'line-width': 3 } });
          ready.current = true;
        });
      });
    return () => {
      ctl.abort();
      abort.current?.abort();
      ready.current = false;
      m?.remove();
      map.current = null;
    };
  }, []);

  // draw mode takes one finger; move mode pans the map
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (mode === 'draw') m.dragPan.disable();
    else m.dragPan.enable();
  }, [mode, area]);

  // the outline follows the drawn shape
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource('area') as GeoJSONSource | undefined;
    src?.setData(area ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [areaPolygon(area)] } } : { type: 'FeatureCollection', features: [] });
  }, [area]);

  // switching shape redraws the same size and centre as the new shape
  const pickKind = (k: AreaKind) => {
    setKind(k);
    setArea((a) => (a ? { ...a, kind: k } : a));
  };

  const est = area && area.sizeM > MIN_AREA_M ? estimate(area) : null;
  const atLimit = !!area && area.sizeM >= MAX_AREA_M;
  const saving = !!status;

  const save = async () => {
    if (!area || !est) return;
    if (est.tiles > BIG_SAVE_TILES && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setMsg('');
    setStatus('Starting…');
    const ctl = (abort.current = new AbortController());
    try {
      const r = await downloadTiles(areaTiles(area), (p) => setStatus(`Saving roads ${p.done}/${p.total}${p.failed ? ` (${p.failed} to retry)` : ''}…`), ctl.signal);
      const info = await packInfo();
      const mb = (info.bytes / 1048576).toFixed(info.bytes > 10485760 ? 0 : 1);
      setMsg(r.failed ? `${r.failed} piece${r.failed === 1 ? '' : 's'} did not download. Tap Save again to fill the gaps. ${info.tiles} pieces are on this phone (${mb} MB).` : `Saved. ${info.tiles} pieces are on this phone (${mb} MB), and Free roam and Fun loop will use them with no signal.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save the roads.');
    } finally {
      abort.current = null;
      setStatus('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="absolute inset-0">
        <div ref={el} className="size-full" role="application" aria-label="Map for drawing an area" />
      </div>
      <div className="safe-t pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 px-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-panel/95 p-2 shadow-xl backdrop-blur">
          <div className="min-w-0 flex-1">
            <SearchBox compact placeholder="Search a place to jump to" onPick={(p) => map.current?.flyTo({ center: p.lngLat, zoom: 9 })} />
          </div>
          <button aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full bg-raise" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 max-h-[52dvh] space-y-2 overflow-y-auto rounded-t-3xl bg-panel p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
        <h2 className="font-display text-2xl font-semibold">Draw an area to save</h2>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Shape">
          <Button variant="raise" aria-pressed={kind === 'circle'} className={kind === 'circle' ? 'bg-brand text-white hover:bg-brand/90' : ''} onClick={() => pickKind('circle')}>Circle</Button>
          <Button variant="raise" aria-pressed={kind === 'square'} className={kind === 'square' ? 'bg-brand text-white hover:bg-brand/90' : ''} onClick={() => pickKind('square')}>Square</Button>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Finger">
          <Button variant="raise" aria-pressed={mode === 'draw'} className={mode === 'draw' ? 'bg-brand text-white hover:bg-brand/90' : ''} onClick={() => setMode('draw')}><Pencil size={18} /> Draw</Button>
          <Button variant="raise" aria-pressed={mode === 'move'} className={mode === 'move' ? 'bg-brand text-white hover:bg-brand/90' : ''} onClick={() => setMode('move')}><Hand size={18} /> Move map</Button>
        </div>
        <p className="text-sm text-mute">
          {mode === 'draw' ? 'Touch the map where the middle should be, then drag outward. Two fingers zoom and move the map.' : 'Drag to move the map. Tap Draw to draw again.'}
        </p>
        {est && area && (
          <div className="rounded-2xl bg-bg p-3 text-sm" aria-live="polite">
            <div className="font-display text-xl font-semibold">{fmtSize(area.sizeM, units)} across</div>
            <div className="text-mute">
              About {est.tiles} map pieces, roughly {est.mbLow < 10 ? est.mbLow.toFixed(1) : Math.round(est.mbLow)} to {Math.round(est.mbHigh)} MB, about {est.minutes} min. This is a guess; the real size shows while saving.
            </div>
            {atLimit && <div className="mt-1 text-sev3">That is the biggest area allowed: {fmtSize(MAX_AREA_M, units)} across.</div>}
          </div>
        )}
        {confirming && est && (
          <p role="alert" className="rounded-xl bg-sev1/15 p-3 text-sm text-sev2">
            This is a big save: about {est.requests} requests to the shared OpenStreetMap servers. Use Wi-Fi, keep Navi open, and expect it to take a while. You can stop and continue later; saved pieces are kept.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" disabled={!est || saving} onClick={() => void save()}>
            {confirming ? 'Yes, save it' : 'Save this area'}
          </Button>
          {saving ? (
            <Button variant="raise" onClick={() => abort.current?.abort()}>Stop</Button>
          ) : (
            <Button variant="raise" disabled={!area} onClick={() => { setArea(null); setConfirming(false); setMsg(''); }}>Clear</Button>
          )}
        </div>
        {status && <p className="text-sm text-mute" aria-live="polite">{status}</p>}
        {msg && <p role="status" className="text-sm text-ink">{msg}</p>}
        <p className="text-xs text-mute">Map data from OpenStreetMap contributors. Saved roads are kept on this phone; downloading them asks public OpenStreetMap servers for the area you drew.</p>
      </div>
    </div>
  );
}
