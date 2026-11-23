import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapGL, NavigationControl, setWorkerUrl, type GeoJSONSource, type StyleSpecification, type SymbolLayerSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection } from 'geojson';
import { RouteTracker, TRAFFIC_COLOR, type Stage, type TrafficSpan } from '@/core';
import { CONFIG } from '@/providers/config';
import { loadStyle } from '@/lib/mapStyle';
import { SEV_COLOR } from '@/lib/cn';
import { useApp, useRideStore } from '@/lib/store';
import { dropPin } from '@/lib/flow';
import { refreshTraffic, useTraffic } from '@/lib/traffic';
import { showProblem } from '@/lib/errorBanner';
import { VEHICLES } from './vehicles';

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

/** Arrow marks for traffic: one line per span and side. The right side is your direction, the left side is oncoming. */
function trafficGeo(stage: Stage | null, spans: TrafficSpan[]): FeatureCollection {
  if (!stage || !spans.length) return EMPTY;
  const tracker = new RouteTracker(stage.route.coords);
  const features: Feature[] = [];
  for (const sp of spans) {
    const coords: [number, number][] = [];
    for (let s = sp.from; s < sp.to; s += 20) coords.push(tracker.pointAt(s).lngLat);
    coords.push(tracker.pointAt(sp.to).lngLat);
    const geometry = { type: 'LineString' as const, coordinates: coords };
    features.push({ type: 'Feature', properties: { side: 'R', icon: `tr-${sp.level}` }, geometry });
    features.push({ type: 'Feature', properties: { side: 'L', icon: `tr-${sp.opp ?? sp.level}` }, geometry });
  }
  return { type: 'FeatureCollection', features };
}

/** A chevron arrow in each traffic colour, drawn on a canvas so the map can use it as an icon. */
function addTrafficIcons(m: MapGL) {
  for (const level of [0, 1, 2, 3] as const) {
    const id = `tr-${level}`;
    if (m.hasImage(id)) continue;
    const c = document.createElement('canvas');
    c.width = 56;
    c.height = 56;
    const cx = c.getContext('2d');
    if (!cx) continue;
    cx.fillStyle = TRAFFIC_COLOR[level];
    cx.beginPath();
    cx.moveTo(28, 6);
    cx.lineTo(48, 42);
    cx.lineTo(28, 32);
    cx.lineTo(8, 42);
    cx.closePath();
    cx.fill();
    m.addImage(id, cx.getImageData(0, 0, 56, 56), { pixelRatio: 2 });
  }
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
        pushTraffic();
      };
      const pushTraffic = () => {
        if (!ready.current) return;
        const st = useApp.getState();
        const tr = useTraffic.getState();
        const show = st.settings.traffic && !!st.stage && tr.key === (st.stage.key ?? null);
        (map1.getSource('traffic') as GeoJSONSource).setData(show ? trafficGeo(st.stage, tr.spans) : EMPTY);
      };
      (map1 as unknown as { _traffic: () => void })._traffic = pushTraffic;
      const applyVehicle = () => {
        if (!ready.current && !map1.getLayer('me-vehicle')) return;
        const v = useApp.getState().settings.vehicle;
        const icon = v !== 'dot' && map1.hasImage(`v-${v}`);
        if (icon) map1.setLayoutProperty('me-vehicle', 'icon-image', `v-${v}`);
        map1.setLayoutProperty('me-vehicle', 'visibility', icon ? 'visible' : 'none');
        map1.setLayoutProperty('me', 'visibility', icon ? 'none' : 'visible');
        map1.setLayoutProperty('me-halo', 'visibility', icon ? 'none' : 'visible');
      };
      (map1 as unknown as { _vehicle: () => void })._vehicle = applyVehicle;
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
        for (const id of ['traffic', 'line', 'hot', 'pts', 'me', 'pins']) map1.addSource(id, { type: 'geojson', data: EMPTY });
        const round = { 'line-cap': 'round', 'line-join': 'round' } as const;
        // traffic: translucent arrows either side of the road, in the turn colours
        addTrafficIcons(map1);
        const arrows: SymbolLayerSpecification['layout'] = {
          'symbol-placement': 'line',
          'symbol-spacing': 40,
          'icon-image': ['get', 'icon'],
          'icon-offset': [15, 0],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 13, 0.8, 16, 1.4, 18, 1.9],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        };
        map1.addLayer({ id: 'traffic-r', type: 'symbol', source: 'traffic', filter: ['==', ['get', 'side'], 'R'], layout: { ...arrows, 'icon-rotate': 0 }, paint: { 'icon-opacity': 0.75 } });
        map1.addLayer({ id: 'traffic-l', type: 'symbol', source: 'traffic', filter: ['==', ['get', 'side'], 'L'], layout: { ...arrows, 'icon-rotate': 180 }, paint: { 'icon-opacity': 0.75 } });
        map1.addLayer({ id: 'route-casing', type: 'line', source: 'line', layout: round, paint: { 'line-color': '#05070a', 'line-width': 11 } });
        map1.addLayer({ id: 'route', type: 'line', source: 'line', layout: round, paint: { 'line-color': '#e9edf2', 'line-width': 5, 'line-opacity': 0.85 } });
        map1.addLayer({ id: 'route-hot', type: 'line', source: 'hot', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } });
        map1.addLayer({ id: 'notes', type: 'circle', source: 'pts', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['get', 'r'], 'circle-stroke-color': '#05070a', 'circle-stroke-width': 2 } });
        map1.addLayer({ id: 'pins-halo', type: 'circle', source: 'pins', paint: { 'circle-color': ['get', 'color'], 'circle-opacity': 0.3, 'circle-radius': 16 } });
        map1.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-color': ['get', 'color'], 'circle-radius': 8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
        // the vehicle marker: drawn as an image, turned to the heading; the plain dot stays the default
        for (const v of VEHICLES.filter((x) => x.id !== 'dot')) {
          const img = new Image(40, 72);
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = 80;
            c.height = 144;
            const cx = c.getContext('2d');
            if (!cx) return;
            cx.drawImage(img, 0, 0, 80, 144);
            if (!map1.hasImage(`v-${v.id}`)) map1.addImage(`v-${v.id}`, cx.getImageData(0, 0, 80, 144), { pixelRatio: 2 });
            applyVehicle();
          };
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v.svg)}`;
        }
        map1.addLayer({ id: 'me-halo', type: 'circle', source: 'me', paint: { 'circle-color': '#56d7e0', 'circle-opacity': 0.25, 'circle-radius': 18 } });
        map1.addLayer({ id: 'me-vehicle', type: 'symbol', source: 'me', layout: { 'icon-image': 'v-car', 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true, visibility: 'none' } });
        map1.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-color': '#56d7e0', 'circle-radius': 7, 'circle-stroke-color': '#0b0d10', 'circle-stroke-width': 3 } });
        ready.current = true;
        push();
        pushPins();
        pushTraffic();
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

  // traffic: fetch when switched on or the route changes, refresh every few minutes, redraw when it arrives
  const trafficOn = useApp((s) => s.settings.traffic);
  const trafficSource = useApp((s) => s.settings.trafficSource);
  const trafficKey = useApp((s) => s.settings.trafficKey);
  useEffect(() => {
    void refreshTraffic(stage);
    if (!trafficOn || !stage) return;
    const t = setInterval(() => void refreshTraffic(useApp.getState().stage), 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [stage, trafficOn, trafficSource, trafficKey]);
  useEffect(() => {
    const redraw = () => (map.current as (MapGL & { _traffic?: () => void }) | null)?._traffic?.();
    const a = useTraffic.subscribe(redraw);
    const b = useApp.subscribe((st, prev) => {
      if (st.settings.traffic !== prev.settings.traffic) redraw();
    });
    return () => {
      a();
      b();
    };
  }, []);

  // vehicle marker choice
  const vehicle = useApp((s) => s.settings.vehicle);
  useEffect(() => {
    (map.current as (MapGL & { _vehicle?: () => void }) | null)?._vehicle?.();
  }, [vehicle]);

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
      src.setData({ type: 'Feature', properties: { bearing: r.bearing }, geometry: { type: 'Point', coordinates: r.lngLat } });
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
