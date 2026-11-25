import { create } from 'zustand';
import { applyEdits, type DialectId, type DriverProfile, type LngLat, type Stage, type UnitSystem } from '@/core';
import { editsFor } from '@/lib/edits';
import type { Place } from '@/providers/photon';

export type Readout = 'both' | 'full' | 'short';
export type Theme = 'dark' | 'light' | 'auto';

export interface RouteAvoid {
  highways: boolean;
  tolls: boolean;
  ferries: boolean;
}

export type VehicleChoice = 'dot' | 'car' | 'bike' | 'utv' | 'truck';

export interface Settings {
  /** On-screen turn text: words ("Sharp left"), shorthand ("L2"), or both. */
  readout: Readout;
  /** Short stereo tones in the ear of the turn, before the spoken call. */
  cues: boolean;
  volume: number;
  avoid: RouteAvoid;
  dialect: DialectId;
  units: UnitSystem;
  profile: DriverProfile;
  leadSec: number;
  speechRate: number;
  voiceURI: string;
  /** Recorded co-driver voice (default) or the phone's own built-in voice. */
  voiceEngine: 'recorded' | 'phone' | 'premium' | 'ondevice' | 'home';
  clipVoice: 'george' | 'michael' | 'emma' | 'heart';
  /** The driver's own OpenAI key for the premium voice. Stays on this device. */
  premiumKey: string;
  premiumVoice: 'ash' | 'onyx' | 'echo' | 'verse' | 'coral' | 'shimmer';
  /** Home voice: the address and private token of the driver's own PC voice server. Stay on this device. */
  homeUrl: string;
  homeToken: string;
  /** Free on-phone voice (Kokoro): which co-driver. */
  deviceVoice: 'bm_lewis' | 'bm_george' | 'am_adam' | 'am_michael' | 'bf_emma' | 'af_heart';
  muted: boolean;
  safetyAccepted: boolean;
  stageAttested: boolean;
  /** Look of the planning screens. The drive screens are always dark. */
  theme: Theme;
  /** Big three-note display for racing and closed courses. */
  stageView: boolean;
  /** Call bumps, rail crossings, speed cameras and narrow points on the road ahead. */
  hazards: boolean;
  /** Traffic outline around the route on the map screen. Never shown in stage view. */
  traffic: boolean;
  /** What marks you on the map. */
  vehicle: VehicleChoice;
  trafficSource: 'sample' | 'tomtom' | 'here';
  /** The user's own free key for TomTom or HERE. Stays on this device. */
  trafficKey: string;
}

export const DEFAULTS: Settings = {
  readout: 'both',
  cues: true,
  volume: 1,
  avoid: { highways: false, tolls: false, ferries: false },
  dialect: 'plain',
  units: 'metric',
  profile: 'road',
  leadSec: 7,
  speechRate: 1.1,
  voiceURI: '',
  voiceEngine: 'recorded',
  clipVoice: 'george',
  premiumKey: '',
  premiumVoice: 'ash',
  deviceVoice: 'bm_lewis',
  homeUrl: '',
  homeToken: '',
  muted: false,
  safetyAccepted: false,
  stageAttested: false,
  stageView: false,
  hazards: true,
  traffic: false,
  vehicle: 'dot',
  trafficSource: 'sample',
  trafficKey: '',
  theme: 'dark',
};

const KEY = 'navi.settings.v2';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    // v1 had rally shorthand as the default; keep only the safety acknowledgement from it
    const old = localStorage.getItem('navi.settings.v1');
    if (old) {
      const o = JSON.parse(old) as Partial<Settings>;
      return { ...DEFAULTS, safetyAccepted: !!o.safetyAccepted, units: o.units ?? DEFAULTS.units };
    }
  } catch {
    /* storage unavailable: fall back to defaults */
  }
  return DEFAULTS;
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export type Screen = 'plan' | 'ride';
export type Tab = 'explore' | 'saved' | 'history';

interface AppState {
  settings: Settings;
  set: (p: Partial<Settings>) => void;
  stage: Stage | null;
  setStage: (s: Stage | null) => void;
  from: Place | null;
  to: Place | null;
  setFrom: (p: Place | null) => void;
  setTo: (p: Place | null) => void;
  userPos: LngLat | null;
  setUserPos: (p: LngLat | null) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  via: Place[];
  setVia: (v: Place[]) => void;
  plan: { busy: boolean; err: string };
  setPlan: (p: Partial<{ busy: boolean; err: string }>) => void;
  tripId: string | null;
  setTripId: (id: string | null) => void;
  /** One plain line about what just happened to the route (for example a shared link opened). */
  notice: string;
  setNotice: (n: string) => void;
}

/** Put the driver's saved edits on a freshly planned stage. The engine's own notes stay in baseNotes. */
export function withEdits(stage: Stage): Stage {
  const base = stage.baseNotes ?? stage.notes;
  return { ...stage, baseNotes: base, notes: applyEdits(base, editsFor(stage.key)) };
}

export const useApp = create<AppState>((set, get) => ({
  settings: load(),
  set: (p) => {
    const settings = { ...get().settings, ...p };
    save(settings);
    set({ settings });
  },
  stage: null,
  setStage: (stage) => set({ stage: stage ? withEdits(stage) : null }),
  from: null,
  to: null,
  setFrom: (from) => set({ from }),
  setTo: (to) => set({ to }),
  userPos: null,
  setUserPos: (userPos) => set({ userPos }),
  screen: 'plan',
  setScreen: (screen) => set({ screen }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  tab: 'explore',
  setTab: (tab) => set({ tab }),
  via: [],
  setVia: (via) => set({ via }),
  plan: { busy: false, err: '' },
  setPlan: (p) => set({ plan: { ...get().plan, ...p } }),
  tripId: null,
  setTripId: (tripId) => set({ tripId }),
  notice: '',
  setNotice: (notice) => set({ notice }),
}));

/* ---- live ride state (updated several times a second) ---- */
export interface RideState {
  active: boolean;
  kind: 'gps' | 'demo' | 'roam' | 'game';
  s: number;
  v: number; // m/s
  lngLat: LngLat | null;
  bearing: number;
  lastCall: { text: string; urgency: string; at: number } | null;
  offRoute: boolean;
  warp: number;
  gpsError: string | null;
  /** Shown in the ride HUD when sound will not come from a voice. */
  audioNote: string | null;
  /** Seconds left in the stage-start countdown, or null. */
  countdown: number | null;
}

export const useRideStore = create<RideState>(() => ({
  active: false,
  kind: 'demo',
  s: 0,
  v: 0,
  lngLat: null,
  bearing: 0,
  lastCall: null,
  offRoute: false,
  warp: 1,
  gpsError: null,
  audioNote: null,
  countdown: null,
}));
