import { create } from 'zustand';
import type { DialectId, DriverProfile, LngLat, Stage, UnitSystem } from '@/core';
import type { Place } from '@/providers/photon';

export type Readout = 'both' | 'full' | 'short';

export interface RouteAvoid {
  highways: boolean;
  tolls: boolean;
  ferries: boolean;
}

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
  muted: boolean;
  safetyAccepted: boolean;
  stageAttested: boolean;
}

const DEFAULTS: Settings = {
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
  muted: false,
  safetyAccepted: false,
  stageAttested: false,
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
}

export const useApp = create<AppState>((set, get) => ({
  settings: load(),
  set: (p) => {
    const settings = { ...get().settings, ...p };
    save(settings);
    set({ settings });
  },
  stage: null,
  setStage: (stage) => set({ stage }),
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
}));

/* ---- live ride state (updated several times a second) ---- */
export interface RideState {
  active: boolean;
  kind: 'gps' | 'demo';
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
}));
