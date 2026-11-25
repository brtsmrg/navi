import { CallScheduler, PROFILE_G, RouteTracker, addHazards, buildGraph, cornerSpeedMps, nearestRoadPoint, followRoad, generateStage, speedProfile, type Call, type Hazard, type RoadGraph, type RoadWay, type Stage } from '@/core';
import { cellKey, cellsAround, fetchCell } from '@/providers/overpass';
import { getPackTile, hazardsFor, packKey, tileOfCell, tileOfPoint } from '@/providers/roadPack';
import { useApp, useRideStore } from '@/lib/store';
import { saveBest, useGame } from './gameState';
import { readInput, rumble, resetInput } from './gameInput';
import { listVoices, primeSpeech, say, stopSpeaking, speechSupported } from '@/lib/speech';
import { cue, releaseAudio, unlockAudio } from '@/lib/audio';
import { keepAwake } from '@/lib/wakeLock';
import { DENIED_MSG } from '@/lib/location';
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
function emit(call: Call) {
  const { settings } = useApp.getState();
  const text = call.text;
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
        if (useApp.getState().locationBlocked) useApp.getState().setLocationBlocked(false);
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
      (err) => onWatchError(err.code),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };
  const cd = o.countdownSec ?? 0;
  if (cd > 0) runCountdown(cd, begin);
  else begin();
}

/** The phone refused or lost location while watching: say so plainly, and show the help card on a refusal. */
function onWatchError(code: number): void {
  if (code === 1) {
    useApp.getState().setLocationBlocked(true);
    useRideStore.setState({ gpsError: DENIED_MSG });
  } else {
    useRideStore.setState({ gpsError: 'Waiting for a GPS fix…' });
  }
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
  roam?.abort?.abort();
  roam = undefined;
  endGame();
  stopSpeaking();
  releaseAudio();
  stageRef = undefined;
  useRideStore.setState({ active: false, countdown: null });
}

/* ───────────────────────── Free roam ─────────────────────────
 * No route: Navi reads the road ahead as the car moves. Road geometry comes in small map squares; the
 * road ahead is followed from the car's position (straight on, same road) and read like a planned route.
 * The position can come from the phone's GPS or, in game mode, from a virtual car.
 */
const LOOKAHEAD_M = 2200;
const REPLAN_BELOW_M = 600;

interface RoamState {
  ways: Map<string, RoadWay[]>;
  graph: RoadGraph | null;
  graphVersion: number;
  loading: boolean;
  failed: string | null;
  plan: { stage: Stage; tracker: RouteTracker; scheduler: CallScheduler; version: number; at: number; junctions: { s: number; options: number }[]; bias: number } | null;
  called: [number, number][];
  lastFix: { lng: number; lat: number; t: number } | null;
  heading: number;
  vSmooth: number;
  abort: AbortController | null;
  packChecked: Set<string>;
  packHave: Set<string>;
  hazardTiles: Map<string, Hazard[]>;
  /** game mode only: corners already judged, and the junction passed last */
  judged: Set<string>;
  junctionsPassed: number;
  game: { steer: number } | null;
}

let roam: RoamState | undefined;

/** Does this feed a position into free roam? Used by the GPS watch and by game mode. */
export interface RoamFix {
  lng: number;
  lat: number;
  t: number;
  /** m/s if the source knows it */
  speed?: number;
  /** compass degrees if the source knows it */
  heading?: number;
  /** the speed is exact (a simulator), so it is not smoothed */
  exact?: boolean;
}

function rebuildGraph(r: RoamState): void {
  // the same way can sit in two squares or tiles, so keep one copy of each
  const seen = new Set<string>();
  const all: RoadWay[] = [];
  for (const list of r.ways.values()) {
    for (const w of list) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      all.push(w);
    }
  }
  r.graph = buildGraph(all);
  r.graphVersion++;
}

/** Bring in the roads around the car: saved offline tiles first, then small squares from the network. */
function loadSquares(r: RoamState, lng: number, lat: number) {
  if (r.loading) return;
  const home = tileOfPoint([lng, lat]);
  const wantTiles: { i: number; j: number }[] = [];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) wantTiles.push({ i: home.i + di, j: home.j + dj });
  const unchecked = wantTiles.filter((t) => !r.packChecked.has(packKey(t)));
  const needCells = () => cellsAround([lng, lat]).filter((c) => !r.ways.has(cellKey(c)) && !r.packHave.has(packKey(tileOfCell(c))));
  if (!unchecked.length && !needCells().length) return;
  r.loading = true;
  const ctl = (r.abort = new AbortController());
  void (async () => {
    let changed = false;
    for (const t of unchecked) {
      r.packChecked.add(packKey(t));
      const ways = await getPackTile(t);
      if (roam !== r) return;
      if (ways) {
        r.ways.set(`pack:${packKey(t)}`, ways);
        r.packHave.add(packKey(t));
        changed = true;
      }
    }
    if (useApp.getState().settings.hazards) {
      for (const t of wantTiles) {
        const k = packKey(t);
        if (r.hazardTiles.has(k)) continue;
        r.hazardTiles.set(k, []); // marked first, so a slow answer is never asked for twice
        void hazardsFor(t, ctl.signal).then((list) => {
          if (roam === r) r.hazardTiles.set(k, list);
        });
      }
    }
    const need = needCells();
    const res = await Promise.allSettled(need.map((c) => fetchCell(c, ctl.signal).then((w) => r.ways.set(cellKey(c), w))));
    if (roam !== r) return;
    const got = res.filter((x) => x.status === 'fulfilled').length;
    if (got > 0 || changed) {
      rebuildGraph(r);
      r.failed = null;
    } else if (need.length && !r.graph) {
      const first = res.find((x): x is PromiseRejectedResult => x.status === 'rejected');
      r.failed = first?.reason instanceof Error ? first.reason.message : 'Road data is not reachable';
      useRideStore.setState({ gpsError: `Free roam needs road data and could not get it (${r.failed}). Check the signal, then it tries again.` });
    }
  })().finally(() => {
    if (roam === r) r.loading = false;
  });
}

function planAhead(r: RoamState, fix: RoamFix, tMs: number, bias = 0): boolean {
  if (!r.graph) return false;
  const res = followRoad(r.graph, [fix.lng, fix.lat], r.heading, { lengthM: LOOKAHEAD_M, firstJunctionBias: bias || undefined });
  if (!res || res.coords.length < 2) return false;
  const stage = generateStage({ coords: res.coords });
  const tracker = new RouteTracker(res.coords);
  // drop the end-of-road "finish" and notes right under the car; hazards join; corners and hazards already called a moment ago go
  const kept = stage.notes.filter((n) => n.kind !== 'finish' && n.s >= 12);
  const withHz = useApp.getState().settings.hazards ? addHazards({ ...stage, notes: kept, baseNotes: kept }, [...r.hazardTiles.values()].flat()) : { ...stage, notes: kept };
  const notes = withHz.notes.filter((n) => {
    if (n.kind === 'finish') return false;
    const [x, y] = tracker.pointAt(n.s).lngLat;
    return !r.called.some(([cx, cy]) => Math.hypot((x - cx) * 78000, (y - cy) * 111000) < 35);
  });
  const shown: Stage = { ...withHz, notes, baseNotes: notes, key: undefined };
  const scheduler = new CallScheduler(notes, schedulerOptions());
  scheduler.reset(0);
  r.plan = { stage: shown, tracker, scheduler, version: r.graphVersion, at: tMs, junctions: res.junctions, bias };
  r.junctionsPassed = 0;
  stageRef = shown;
  useApp.getState().setStage(shown);
  return true;
}

/** One position update. Calls the corners ahead on the road the car is on. */
export function roamFix(fix: RoamFix): void {
  const r = roam;
  if (!r) return;
  let v = fix.speed ?? NaN;
  if (!Number.isFinite(v) && r.lastFix) {
    const dt = (fix.t - r.lastFix.t) / 1000;
    if (dt > 0) v = Math.hypot((fix.lng - r.lastFix.lng) * 78000, (fix.lat - r.lastFix.lat) * 111000) / dt;
  }
  if (!Number.isFinite(v)) v = 0;
  r.vSmooth = fix.exact || r.vSmooth === 0 ? v : 0.6 * r.vSmooth + 0.4 * v;
  // heading: the sensor's when it moves fast enough to be trusted, else the direction of travel
  if (fix.heading !== undefined && Number.isFinite(fix.heading) && v > 2) r.heading = fix.heading;
  else if (r.lastFix) {
    const dx = (fix.lng - r.lastFix.lng) * 78000;
    const dy = (fix.lat - r.lastFix.lat) * 111000;
    if (Math.hypot(dx, dy) > 8) r.heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  }
  r.lastFix = { lng: fix.lng, lat: fix.lat, t: fix.t };
  loadSquares(r, fix.lng, fix.lat);

  let snap = r.plan ? r.plan.tracker.snap(fix.lng, fix.lat) : null;
  // game mode: steering picks the road at the next junction, and a junction just passed makes the next one the first
  let steerBias = 0;
  if (r.game && r.plan && snap) {
    const nextJ = r.plan.junctions.find((j) => j.s > snap!.s - 3);
    const passed = r.plan.junctions.filter((j) => j.s <= snap!.s - 3).length;
    if (nextJ && nextJ.s - snap.s < 170) steerBias = r.game.steer > 0.4 ? -1 : r.game.steer < -0.4 ? 1 : 0;
    if (steerBias !== r.plan.bias || passed > r.junctionsPassed) {
      r.junctionsPassed = passed;
      if (r.graph && planAhead(r, fix, fix.t, steerBias)) snap = r.plan!.tracker.snap(fix.lng, fix.lat);
    }
  }
  const remaining = r.plan && snap ? r.plan.tracker.length - snap.s : 0;
  const stale = !r.plan || !snap || snap.offsetM > 35 || remaining < REPLAN_BELOW_M || (r.plan.version !== r.graphVersion && remaining < 1400);
  if (stale && (!r.plan || fix.t - r.plan.at > 1500) && r.graph) {
    if (planAhead(r, fix, fix.t)) {
      snap = r.plan!.tracker.snap(fix.lng, fix.lat);
      useRideStore.setState({ gpsError: null, offRoute: false });
    } else if (!r.plan || (snap && snap.offsetM > 60)) {
      useRideStore.setState({ gpsError: 'Not on a mapped road yet. Calls start when you are on one.' });
      return;
    }
  }
  if (!r.plan || !snap) {
    if (!r.graph && !r.failed) useRideStore.setState({ gpsError: 'Loading the roads around you…' });
    return;
  }
  const p = r.plan.tracker.pointAt(snap.s);
  useRideStore.setState({ s: snap.s, v: r.vSmooth, lngLat: [fix.lng, fix.lat], bearing: Number.isFinite(r.heading) ? r.heading : p.bearingDeg });
  const call = r.plan.scheduler.update(snap.s, r.vSmooth, fix.t);
  if (call) {
    emit(call);
    for (const id of call.noteIds) {
      const n = r.plan.stage.notes.find((x) => x.id === id);
      if (n) {
        r.called.push(r.plan.tracker.pointAt(n.s).lngLat);
        if (r.called.length > 40) r.called.shift();
      }
    }
  }
}

/** Start Free roam on the phone's GPS. Runs inside a tap. */
export function startRoam(): void {
  stopRide();
  unlockAudio();
  warmClips();
  if (!listVoices().length) primeSpeech();
  stopAwake = keepAwake();
  roam = { ways: new Map(), graph: null, graphVersion: 0, loading: false, failed: null, plan: null, called: [], lastFix: null, heading: NaN, vSmooth: 0, abort: null, packChecked: new Set(), packHave: new Set(), hazardTiles: new Map(), judged: new Set(), junctionsPassed: 0, game: null };
  unsub = useApp.subscribe((st, prev) => {
    if (st.settings !== prev.settings) roam?.plan?.scheduler.setOptions(schedulerOptions());
    if (st.settings.muted && !prev.settings.muted) stopSpeaking();
  });
  useRideStore.setState({ active: true, kind: 'roam', s: 0, v: 0, lngLat: null, bearing: 0, lastCall: null, offRoute: false, warp: 1, gpsError: 'Waiting for a GPS fix…', audioNote: null, countdown: null });
  // an empty stage so the screen shows Free roam right away and never an older route
  const blank = generateStage({ coords: [[0, 0], [0.0005, 0]] });
  stageRef = blank;
  useApp.getState().setStage({ ...blank, notes: [], baseNotes: [], key: undefined });
  announceReady();
  if (!('geolocation' in navigator)) {
    useRideStore.setState({ gpsError: 'This device has no location sensor.' });
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (useApp.getState().locationBlocked) useApp.getState().setLocationBlocked(false);
      roamFix({ lng: pos.coords.longitude, lat: pos.coords.latitude, t: pos.timestamp, speed: pos.coords.speed ?? undefined, heading: pos.coords.heading ?? undefined });
    },
    (err) => onWatchError(err.code),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
}

/* ───────────────────────── Game mode ─────────────────────────
 * A virtual car on real roads. The same road reader and co-driver as Free roam, but the position comes from a
 * simple driving model steered by a gamepad, the keyboard or the on-screen buttons, never from GPS.
 */
const V_MAX = 52; // m/s, about 187 km/h
const TICK_MS = 50;

interface GameRun {
  timer: ReturnType<typeof setInterval>;
  pos: [number, number];
  v: number;
  last: number;
  crashUntil: number;
  distance: number;
  score: number;
  streak: number;
  started: boolean;
}
let gameRun: GameRun | undefined;

function endGame(): void {
  if (!gameRun) return;
  clearInterval(gameRun.timer);
  const g = useGame.getState();
  if (g.score > g.best) {
    saveBest(g.score);
    useGame.setState({ best: g.score });
  }
  gameRun = undefined;
  resetInput();
  useGame.setState({ paused: false, junction: null, deadEnd: false, feedback: null });
}

const say2 = (text: string, kind: 'clean' | 'sloppy' | 'crash' | 'bump' | 'info') => useGame.setState({ feedback: { text, kind, at: Date.now() } });

function gameTick(): void {
  const r = roam;
  const g = gameRun;
  if (!r || !g || !r.game) return;
  const now = Date.now();
  const inp = readInput();
  useGame.setState({ pad: inp.pad, throttle: inp.throttle, brake: inp.brake, steer: inp.steer });
  if (inp.pause) {
    const paused = !useGame.getState().paused;
    useGame.setState({ paused });
    if (paused) stopSpeaking();
  }
  const dt = Math.min(0.2, (now - g.last) / 1000);
  g.last = now;
  if (useGame.getState().paused) return;
  r.game.steer = inp.steer;

  // wait for the roads, then drop the car on the nearest one
  if (!r.graph) {
    roamFix({ lng: g.pos[0], lat: g.pos[1], t: now, speed: 0, exact: true });
    return;
  }
  if (!g.started) {
    const near = nearestRoadPoint(r.graph, g.pos, 500);
    if (!near) {
      useRideStore.setState({ gpsError: 'No road near this spot. Try a place with roads around it.' });
      return;
    }
    g.pos = near.point;
    r.heading = near.bearingDeg;
    r.lastFix = null; // the jump onto the road is not a direction of travel
    g.started = true;
    useRideStore.setState({ gpsError: null });
    say2('Press gas to go', 'info');
  }
  if (inp.turn) {
    r.heading = (r.heading + 180) % 360;
    r.lastFix = null;
    r.plan = null;
    g.v = 0;
    say2('Turned around', 'info');
  }

  // driving model
  const crashed = now < g.crashUntil;
  let v = g.v;
  const throttle = crashed ? 0 : inp.throttle;
  const accel = 6.5 * throttle * Math.max(0, 1 - v / V_MAX);
  const decel = 16 * inp.brake + (throttle > 0 ? 0 : 0.25 + 0.0006 * v * v);
  v = Math.max(0, v + (accel - decel) * dt);

  // move along the road the reader is following
  let heading = r.heading;
  if (r.plan) {
    const snap = r.plan.tracker.snap(g.pos[0], g.pos[1]);
    const end = r.plan.tracker.length;
    const room = end - snap.s;
    const stuck = room < 3;
    if (stuck) v = 0;
    const next = Math.min(end, snap.s + v * dt);
    const p = r.plan.tracker.pointAt(next);
    g.pos = p.lngLat;
    heading = p.bearingDeg;
    g.distance += Math.max(0, next - snap.s);
    g.score += Math.max(0, next - snap.s) * 0.1 * (1 + Math.min(g.streak, 10) * 0.2);
    if (useGame.getState().deadEnd !== stuck) useGame.setState({ deadEnd: stuck });
  }
  g.v = v;
  roamFix({ lng: g.pos[0], lat: g.pos[1], t: now, speed: v, heading, exact: true });

  // judge corners and bumps as the car passes them
  const plan = r.plan;
  if (plan) {
    const s = plan.tracker.snap(g.pos[0], g.pos[1]).s;
    for (const n of plan.stage.notes) {
      const at = n.kind === 'corner' ? (n.apexS ?? n.s) : n.s;
      if (s < at || s - at > 30) continue;
      const [x, y] = plan.tracker.pointAt(at).lngLat;
      const key = `${n.kind}:${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
      if (r.judged.has(key)) continue;
      r.judged.add(key);
      if (n.kind === 'corner' && n.radius !== undefined) {
        const limit = cornerSpeedMps(n.radius, PROFILE_G.road);
        const ratio = v / Math.max(3, limit);
        const mult = 1 + Math.min(g.streak, 10) * 0.2;
        if (ratio <= 1.15) {
          const pts = Math.round((ratio > 0.85 ? 90 : 50) * mult);
          g.score += pts;
          g.streak++;
          say2(`${ratio > 0.85 ? 'Fast and clean' : 'Clean'} +${pts}`, 'clean');
        } else if (ratio <= 1.4) {
          g.v = v *= 0.75;
          g.streak = 0;
          say2('Too wide, you lost speed', 'sloppy');
          rumble(0.5, 250);
        } else {
          g.v = v = 0;
          g.streak = 0;
          g.score = Math.max(0, g.score - 150);
          g.crashUntil = now + 1500;
          say2('Off the road! -150', 'crash');
          rumble(1, 600);
        }
      } else if (n.kind === 'hazard' && n.hazard === 'bump' && v > 22) {
        g.v = v *= 0.85;
        say2('Hard on the bump', 'bump');
        rumble(0.4, 200);
      }
    }
    if (r.judged.size > 400) r.judged = new Set([...r.judged].slice(-100));
    const nextJ = plan.junctions.find((j) => j.s > s - 3);
    useGame.setState({ junction: nextJ && nextJ.s - s < 250 && nextJ.options > 1 ? { dist: nextJ.s - s, options: nextJ.options } : null });
  }
  useGame.setState({ score: Math.round(g.score), streak: g.streak, distanceM: g.distance });
}

/** Start the game at a place. The roads there are read first, then the car is put on the nearest one. */
export function startGame(origin: [number, number]): void {
  stopRide();
  unlockAudio();
  warmClips();
  if (!listVoices().length) primeSpeech();
  stopAwake = keepAwake();
  roam = { ways: new Map(), graph: null, graphVersion: 0, loading: false, failed: null, plan: null, called: [], lastFix: null, heading: NaN, vSmooth: 0, abort: null, packChecked: new Set(), packHave: new Set(), hazardTiles: new Map(), judged: new Set(), junctionsPassed: 0, game: { steer: 0 } };
  unsub = useApp.subscribe((st, prev) => {
    if (st.settings !== prev.settings) roam?.plan?.scheduler.setOptions(schedulerOptions());
    if (st.settings.muted && !prev.settings.muted) stopSpeaking();
  });
  useGame.getState().reset();
  resetInput();
  useRideStore.setState({ active: true, kind: 'game', s: 0, v: 0, lngLat: origin, bearing: 0, lastCall: null, offRoute: false, warp: 1, gpsError: 'Loading the roads around you…', audioNote: null, countdown: null });
  const blank = generateStage({ coords: [[0, 0], [0.0005, 0]] });
  stageRef = blank;
  useApp.getState().setStage({ ...blank, notes: [], baseNotes: [], key: undefined });
  announceReady();
  gameRun = { timer: setInterval(gameTick, TICK_MS), pos: origin, v: 0, last: Date.now(), crashUntil: 0, distance: 0, score: 0, streak: 0, started: false };
}
