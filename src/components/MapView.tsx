import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapGL, NavigationControl, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection } from 'geojson';
import { RouteTracker, type Stage } from '@/core';
import { CONFIG } from '@/providers/config';
import { loadStyle } from '@/lib/mapStyle';
import { SEV_COLOR } from '@/lib/cn';
import { useApp, useRideStore } from '@/lib/store';
import { dropPin } from '@/lib/flow';
import { showProblem } from '@/lib/errorBanner';

// Vite fingerprints the worker file; tell MapLibre where it ended up.
setWorkerUrl(workerUrl);

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function stageGeo(stage: Stage) {
  const tracker = new RouteTracker(stage.route.coords);
  const line: FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: stage.route.coords } }],
  };
  const hot: Feature[] = [];
  const pts: Feature[] = [];
  for (const n of stage.notes) {
    if (!n.severity) continue;
    const coords: [number, number][] = [];
    const end = Math.max(n.sEnd, n.s + 10);
    for (let s = n.s; s < end; s += 8) coords.push(tracker.pointAt(s).lngLat);
    coords.push(tracker.pointAt(end).lngLat);
    hot.push({
      type: 'Feature',
      properties: { color: SEV_COLOR[n.severity], sev: n.severity },
      geometry: { type: 'LineString', coordinates: coords },
    });
    pts.push({
      type: 'Feature',
      properties: { color: SEV_COLOR[n.severity], r: 8 - n.severity },
      geometry: { type: 'Point', coordinates: tracker.pointAt(n.s).lngLat },
    });
  }
  return {
    line,
    hot: { type: 'FeatureCollection', features: hot } as FeatureCollection,
    pts: { type: 'FeatureCollection', features: pts } as FeatureCollection,
  };
}

function fitToStage(m: MapGL, stage: Stage | null) {
  if (!stage || stage.route.coords.length < 2) return;
  const b = new LngLatBounds();
  stage.route.coords.forEach((c) => b.extend(c));
  m.fitBounds(b, { padding: { top: 60, left: 40, right: 40, bottom: window.innerHeight * 0.5 }, duration: 600, maxZoom: 16 });
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapGL | null>(null);
  const ready = useRef(false);
  const stage = useApp((s) => s.stage);
  const active = useRideStore((s) => s.active);

  useEffect(() => {
    if (!el.current) return;
    const ctl = new AbortController();
    const container = el.current;
    let m: MapGL | undefined;
    // Load the style first, then build the map: swapping styles on a live map can skip the "style.load" event.
    void loadStyle(CONFIG.mapStyle, ctl.signal).catch((e) => { if (!ctl.signal.aborted) showProblem('map style', e); return null; }).then((style) => {
      if (!style || ctl.signal.aborted) return;
      m = new MapGL({
        container,
        style: style as StyleSpecification,
        center: [-75.7, 45.42],
        zoom: 9,
        attributionControl: { compact: true },
        maxPitch: 70,
      });
      map.current = m;
      // two-finger twist rotates the map; the compass (top right) appears when rotated and snaps back to north on tap
      m.addControl(new NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }), 'top-right');
      const map1 = m;
      const push = () => {
        if (!ready.current) return;
        const st = useApp.getState().stage;
        const g = st ? stageGeo(st) : { line: EMPTY, hot: EMPTY, pts: EMPTY };
        (map1.getSource('line') as GeoJSONSource).setData(g.line);
        (map1.getSource('hot') as GeoJSONSource).setData(g.hot);
        (map1.getSource('pts') as GeoJSONSource).setData(g.pts);
      };
      (map1 as unknown as { _push: () => void })._push = push;
      const pushPins = () => {
        if (!ready.current) return;
        const { from, to, via } = useApp.getState();
        const pin = (p: { lngLat: [number, number] }, color: string) => ({ type: 'Feature' as const, properties: { color }, geometry: { type: 'Point' as const, coordinates: p.lngLat } });
        const feats = [
          ...(from && from.id !== 'here' ? [pin(from, '#ffffff')] : []),
          ...via.map((v) => pin(v, '#ffb02e')),
          ...(to ? [pin(to, '#e41626')] : []),
        ];
        (map1.getSource('pins') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
      };
      (map1 as unknown as { _pins: () => void })._pins = pushPins;

      // long-press (or right-click) drops a pin and routes there
      let pressTimer: ReturnType<typeof setTimeout> | undefined;
      const cancel = () => clearTimeout(pressTimer);
      const drop = (ll: { lng: number; lat: number }) => {
        if (useRideStore.getState().active) return;
        void dropPin([ll.lng, ll.lat]);
      };
      map1.on('contextmenu', (e) => drop(e.lngLat));
      map1.on('touchstart', (e) => {
        cancel();
        if (e.points.length !== 1) return;
        pressTimer = setTimeout(() => drop(e.lngLat), 650);
      });
      for (const ev of ['touchmove', 'touchend', 'touchcancel', 'movestart', 'zoomstart'] as const) map1.on(ev, cancel);
      let lastErr = '';
      map1.on('error', (e) => (lastErr = e.error?.message ?? 'unknown map error'));
      setTimeout(() => {
        if (!ready.current && !ctl.signal.aborted) showProblem('map', new Error(`the map did not finish loading. ${lastErr}`));
      }, 10000);
      map1.on('load', () => {
        for (const id of ['line', 'hot', 'pts', 'me', 'pins']) map1.addSource(id, { type: 'geojson', data: EMPTY });
        const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
        map1.addLayer({ id: 'route-casing', type: 'line', source: 'line', layout: round, paint: { 'line-color': '#05070a', 'line-width': 11 } });
        map1.addLayer({ id: 'route', type: 'line', source: 'line', layout: round, paint: { 'line-color': '#e9edf2', 'line-width': 5, 'line-opacity': 0.85 } });
        map1.addLayer({ id: 'route-hot', type: 'line', source: 'hot', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
        map1.addLayer({ id: 'notes', type: 'circle', source: 'pts', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['get', 'r'], 'circle-stroke-color': '#05070a', 'circle-stroke-width': 2 } });
        map1.addLayer({ id: 'pins-halo', type: 'circle', source: 'pins', paint: { 'circle-color': ['get', 'color'], 'circle-opacity': 0.3, 'circle-radius': 16 } });
        map1.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-color': ['get', 'color'], 'circle-radius': 8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
        map1.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-color': '#56d7e0', 'circle-opacity': 0.25, 'circle-radius': 18 } });
        map1.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-color': '#56d7e0', 'circle-radius': 7, 'circle-stroke-color': '#0b0d10', 'circle-stroke-width': 3 } });
        ready.current = true;
        push();
        pushPins();
        fitToStage(map1, useApp.getState().stage);
      });
    });
    return () => {
      ctl.abort();
      ready.current = false;
      m?.remove();
      map.current = null;
    };
  }, []);

  // start, stop and destination pins
  useEffect(() => {
    const redraw = () => (map.current as (MapGL & { _pins?: () => void }) | null)?._pins?.();
    return useApp.subscribe((st, prev) => {
      if (st.from !== prev.from || st.to !== prev.to || st.via !== prev.via) redraw();
    });
  }, []);

  // route changes
  useEffect(() => {
    const m = map.current as (MapGL & { _push?: () => void }) | null;
    if (!m || !ready.current) return;
    m._push?.();
    fitToStage(m, stage);
  }, [stage]);

  // live position + follow camera
  useEffect(() => {
    return useRideStore.subscribe((r) => {
      const m = map.current;
      if (!m || !ready.current) return;
      const src = m.getSource('me') as GeoJSONSource | undefined;
      if (!src) return;
      if (!r.active || !r.lngLat) {
        src.setData(EMPTY);
        return;
      }
      src.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: r.lngLat } });
      const kmh = r.v * 3.6;
      m.easeTo({
        center: r.lngLat,
        bearing: r.bearing,
        pitch: 55,
        zoom: Math.max(13.5, 17 - kmh / 45),
        duration: 400,
        easing: (t) => t,
        padding: { top: Math.round(window.innerHeight * 0.6), bottom: 0, left: 0, right: 0 },
      });
    });
  }, []);

  // leaving ride: flatten the camera
  useEffect(() => {
    if (!active) map.current?.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 400 });
  }, [active]);

  // maplibre-gl.css sets position:relative on its container, so size it from a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" role="application" aria-label="Map" />
    </div>
  );
}
