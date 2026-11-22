import { CallScheduler, RouteTracker, speedProfile, type Stage } from '@/core';
import { useApp, useRideStore } from '@/lib/store';
import { primeSpeech, say, stopSpeaking } from '@/lib/speech';
import { keepAwake } from '@/lib/wakeLock';

/**
 * Imperative ride controller: owns the timers, GPS watch, tracker and
 * scheduler. UI reads state from useRideStore.
 */
let timer: ReturnType<typeof setInterval> | undefined;
let watchId: number | undefined;
let stopAwake: (() => void) | undefined;
let unsub: (() => void) | undefined;
let scheduler: CallScheduler | undefined;

function emit(text: string, urgency: string, interrupt: boolean) {
  const { settings } = useApp.getState();
  useRideStore.setState({ lastCall: { text, urgency, at: Date.now() } });
  if (!settings.muted) say(text, { rate: settings.speechRate, voiceURI: settings.voiceURI, interrupt });
}

function schedulerOptions() {
  const { settings } = useApp.getState();
  return {
    dialect: settings.dialect,
    units: settings.units,
    leadSec: settings.leadSec,
    maxGroup: 3,
    // the closed-course profile only applies after the driver has attested to it
    profile: settings.profile === 'stage' && !settings.stageAttested ? ('road' as const) : settings.profile,
    speechRate: settings.speechRate,
    brakeMps2: 4,
  };
}

export interface RideOptions {
  kind: 'gps' | 'demo';
  /** demo only */
  cruiseKmh?: number;
  warp?: number;
}

export function startRide(stage: Stage, o: RideOptions): void {
  stopRide();
  primeSpeech(); // must run inside the tap handler for iOS
  const tracker = new RouteTracker(stage.route.coords);
  scheduler = new CallScheduler(stage.notes, schedulerOptions());
  scheduler.reset(0);
  stopAwake = keepAwake();
  unsub = useApp.subscribe((st, prev) => {
    if (st.settings !== prev.settings) scheduler?.setOptions(schedulerOptions());
    if (st.settings.muted && !prev.settings.muted) stopSpeaking();
  });

  const warp = o.warp ?? 1;
  useRideStore.setState({
    active: true, kind: o.kind, s: 0, v: 0, lngLat: stage.route.coords[0], bearing: 0,
    lastCall: null, offRoute: false, warp, gpsError: null,
  });

  const handle = (s: number, v: number, nowMs: number) => {
    const call = scheduler?.update(s, v, nowMs);
    if (call) emit(call.text, call.urgency, call.kind === 'alert');
    if (s >= tracker.length - 5) finishSoon();
  };

  if (o.kind === 'demo') {
    const speeds = speedProfile(stage.path, { cruiseMps: (o.cruiseKmh ?? 80) / 3.6, profile: 'road' });
    let s = 0;
    let simMs = 0;
    const tickMs = 100;
    timer = setInterval(() => {
      const i = Math.min(stage.path.n - 1, Math.floor(s / stage.path.ds));
      const v = speeds[i];
      s = Math.min(tracker.length, s + v * (tickMs / 1000) * warp);
      simMs += tickMs * warp;
      const p = tracker.pointAt(s);
      useRideStore.setState({ s, v, lngLat: p.lngLat, bearing: p.bearingDeg });
      handle(s, v, simMs);
    }, tickMs);
    return;
  }

  if (!('geolocation' in navigator)) {
    useRideStore.setState({ gpsError: 'This device has no location sensor.' });
    return;
  }
  let hint: number | undefined;
  let last: { lng: number; lat: number; t: number } | undefined;
  let vSmooth = 0;
  let offSince = 0;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { longitude: lng, latitude: lat, speed, heading } = pos.coords;
      const t = pos.timestamp;
      let v = speed ?? NaN;
      if (!Number.isFinite(v) && last) {
        const dt = (t - last.t) / 1000;
        if (dt > 0) {
          const dx = (lng - last.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
          const dy = (lat - last.lat) * 110540;
          v = Math.hypot(dx, dy) / dt;
        }
      }
      if (!Number.isFinite(v)) v = 0;
      vSmooth = vSmooth === 0 ? v : 0.6 * vSmooth + 0.4 * v;
      last = { lng, lat, t };
      const snap = tracker.snap(lng, lat, hint);
      hint = snap.s;
      const off = snap.offsetM > 40;
      if (off && !offSince) offSince = t;
      if (!off) offSince = 0;
      const p = tracker.pointAt(snap.s);
      useRideStore.setState({
        s: snap.s, v: vSmooth, lngLat: [lng, lat], bearing: heading ?? p.bearingDeg,
        offRoute: offSince > 0 && t - offSince > 5000, gpsError: null,
      });
      handle(snap.s, vSmooth, t);
    },
    (err) => useRideStore.setState({ gpsError: err.code === 1 ? 'Location is blocked. Allow it in your browser settings.' : 'Waiting for a GPS fix…' }),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
}

let finishing = false;
function finishSoon() {
  if (finishing) return;
  finishing = true;
  setTimeout(() => {
    stopRide();
    finishing = false;
  }, 4000);
}

export function stopRide(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchId = undefined;
  stopAwake?.();
  stopAwake = undefined;
  unsub?.();
  unsub = undefined;
  scheduler = undefined;
  stopSpeaking();
  useRideStore.setState({ active: false });
}
