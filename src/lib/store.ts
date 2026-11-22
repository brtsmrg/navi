import { create } from 'zustand';
import type { DialectId, DriverProfile, LngLat, Stage, UnitSystem } from '@/core';
import type { Place } from '@/providers/photon';

export interface Settings {
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
  dialect: 'rally',
  units: 'metric',
  profile: 'road',
  leadSec: 7,
  speechRate: 1.1,
  voiceURI: '',
  muted: false,
  safetyAccepted: false,
  stageAttested: false,
};

const KEY = 'navi.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
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
}));
