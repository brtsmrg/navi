import { CallScheduler, RouteTracker, gapText, speedProfile, type Call, type Stage } from '@/core';
import { useApp, useRideStore } from '@/lib/store';
import { listVoices, primeSpeech, say, stopSpeaking, speechSupported } from '@/lib/speech';
import { cue, releaseAudio, unlockAudio } from '@/lib/audio';
import { keepAwake } from '@/lib/wakeLock';
import { warmClips } from '@/lib/clips';

/**
 * Imperative ride controller: owns the timers, GPS watch, tracker and
 * scheduler. UI reads state from useRideStore.
 */
let timer: ReturnType<typeof setInterval> | undefined;
let watchId: number | undefined;
let stopAwake: (() => void) | undefined;
let unsub: (() => void) | undefined;
let scheduler: CallScheduler | undefined;

let stageRef: Stage | undefined;

/** Plain English calls open with the distance ("In 150 metres, sharp left"); rally calls stay terse. */
function withLead(call: Call, text: string): string {
  const { settings } = useApp.getState();
  if (settings.dialect !== 'plain' || call.kind !== 'notes' || call.distanceToFirst < 60) return text;
  const g = gapText(call.distanceToFirst, { dialect: 'plain', units: settings.units });
  const lead = g.replace(/^then /, '');
  if (lead === g) return text;
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function emit(call: Call) {
  const { settings } = useApp.getState();
  const text = withLead(call, call.text);
  const interrupt = call.kind === 'alert';
  useRideStore.setState({ lastCall: { text, urgency: call.urgency, at: Date.now() } });
  if (settings.muted) return;
  const first = stageRef?.notes.find((n) => n.id === call.firstNoteId);
  const side = first?.side;
  let delay = 0;
  if (settings.cues && (call.kind === 'alert' || side)) {
    cue(call.kind === 'alert' ? undefined : side, call.kind === 'alert' ? 1 : (first?.severity ?? 4), settings.volume);
    delay = 260; // let the tone finish before the voice starts
  }
  const speak = () => say(text, { rate: settings.speechRate, voiceURI: settings.voiceURI, volume: settings.volume, interrupt, onFail: () => { if (!useRideStore.getState().audioNote) useRideStore.setState({ audioNote: NO_SOUND }); } });
  if (delay) setTimeout(speak, delay);
  else speak();
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

const NO_SOUND =
  'No sound heard? Turn the silent switch (side of the iPhone) off, turn the volume up, then tap Test sound. The turn is always shown on screen.';

/** Immediate audible proof that sound works, and a plain note when this device has no voice. Runs inside the Start tap. */
function announceReady() {
  const { settings } = useApp.getState();
  if (settings.muted) return;
  if (settings.cues) cue(undefined, 4, settings.volume);
  let heard = false;
  const speakIt = () => {
    const st = useApp.getState().settings;
    say('Navi is on.', { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, onStart: () => (heard = true), noRetry: true });
  };
  // Speak inside the tap, always. iOS lists its voices late (often empty on first tap) and only lets
  // the first utterance start from a gesture, so waiting for voices would lose the permission.
  if (speechSupported() || settings.voiceEngine === 'recorded') speakIt();
  else useRideStore.setState({ audioNote: 'This browser cannot speak. You will hear beeps (left ear = left turn) and see the turn on screen.' });
  setTimeout(() => {
    if (useRideStore.getState().active && !heard && (speechSupported() || useApp.getState().settings.voiceEngine === 'recorded') && !useRideStore.getState().audioNote) useRideStore.setState({ audioNote: NO_SOUND });
  }, 3500);
}

/** Wired to the "Test sound" button: a beep in each ear, then a spoken line. Must run inside a tap. */
export function testSound(): void {
  unlockAudio();
  const st = useApp.getState().settings;
  cue('L', 3, st.volume);
  setTimeout(() => cue('R', 3, st.volume), 450);
  setTimeout(() => say('Sound check. Left three, right three.', { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true, onStart: () => useRideStore.setState({ audioNote: null }) }), 950);
}

/** Say the last call again, on demand. Runs inside a tap. */
export function repeatLast(): void {
  const { lastCall } = useRideStore.getState();
  const { settings } = useApp.getState();
  if (!lastCall || settings.muted) return;
  say(lastCall.text, { rate: settings.speechRate, voiceURI: settings.voiceURI, volume: settings.volume, interrupt: true });
}

export interface RideOptions {
  kind: 'gps' | 'demo';
  /** Seconds to count down before the stage starts (stage view). 0 or missing starts at once. */
  countdownSec?: number;
  /** demo only */
  cruiseKmh?: number;
  warp?: number;
}

let cdTimers: ReturnType<typeof setTimeout>[] = [];

/** Stage start: spoken and beeped count, then the ride begins on "Go". */
function runCountdown(sec: number, done: () => void) {
  for (let i = 0; i <= sec; i++) {
    cdTimers.push(
      setTimeout(() => {
        if (!useRideStore.getState().active) return;
        const left = sec - i;
        const st = useApp.getState().settings;
        useRideStore.setState({ countdown: left > 0 ? left : null });
        if (left > 0) {
          if (st.cues && !st.muted) cue(undefined, 4, st.volume);
          if (!st.muted) say(String(left), { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true });
        } else {
          if (!st.muted) say('Go', { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true });
          done();
        }
      }, 1800 + i * 1000),
    );
  }
}

export function startRide(stage: Stage, o: RideOptions): void {
  stopRide();
  stageRef = stage;
  unlockAudio(); // browsers only allow sound after a tap, so this runs inside the tap handler
  warmClips();
  if (!listVoices().length) primeSpeech();
  const tracker = new RouteTracker(stage.route.coords);
  scheduler = new CallScheduler(stage.notes, schedulerOptions());
  scheduler.reset(0);
  stopAwake = keepAwake();
  unsub = useApp.subscribe((st, prev) => {
    if (st.settings !== prev.settings) scheduler?.setOptions(schedulerOptions());
    // a pacenote edit made during the ride changes the calls still to come
    if (st.stage !== prev.stage && st.stage && stageRef && st.stage.key === stageRef.key) {
      stageRef = st.stage;
      scheduler?.setNotes(st.stage.notes, useRideStore.getState().s);
    }
    if (st.settings.muted && !prev.settings.muted) stopSpeaking();
  });

  const warp = o.warp ?? 1;
  useRideStore.setState({
    active: true, kind: o.kind, s: 0, v: 0, lngLat: stage.route.coords[0], bearing: 0,
    lastCall: null, offRoute: false, warp, gpsError: null, audioNote: null, countdown: null,
  });
  announceReady();

  const begin = () => {
    const handle = (s: number, v: number, nowMs: number) => {
      const call = scheduler?.update(s, v, nowMs);
      if (call) emit(call);
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
          offRoute: offSince > 0 && t - offSince > 5000,
          gpsError: snap.offsetM > 2000 ? `You are ${(snap.offsetM / 1000).toFixed(snap.offsetM > 20000 ? 0 : 1)} km from this road, so there is nothing to call yet. Stop, then tap Watch a demo drive to hear how Navi sounds.` : null,
        });
        handle(snap.s, vSmooth, t);
      },
      (err) => useRideStore.setState({ gpsError: err.code === 1 ? 'Location is blocked. Allow it in your browser settings.' : 'Waiting for a GPS fix…' }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };
  const cd = o.countdownSec ?? 0;
  if (cd > 0) runCountdown(cd, begin);
  else begin();
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
  cdTimers.forEach(clearTimeout);
  cdTimers = [];
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchId = undefined;
  stopAwake?.();
  stopAwake = undefined;
  unsub?.();
  unsub = undefined;
  scheduler = undefined;
  stopSpeaking();
  releaseAudio();
  stageRef = undefined;
  useRideStore.setState({ active: false, countdown: null });
}
