import { create } from 'zustand';
import type { Place } from '@/providers/photon';

/** Everything the driver keeps: Home, Work, favourites, recent searches and trips. Stored on this device only. */

export interface Fav {
  id: string;
  label: string;
  place: Place;
}

export interface Trip {
  id: string;
  at: number;
  from: Place;
  to: Place;
  via: Place[];
  distanceM: number;
  durationS?: number;
  corners: number;
  started: boolean;
  /** Pinned trips show under Saved routes. */
  pinned: boolean;
  name?: string;
}

export interface Library {
  home: Fav | null;
  work: Fav | null;
  favs: Fav[];
  recents: { place: Place; at: number }[];
  trips: Trip[];
}

const KEY = 'navi.library.v1';
const MAX_RECENTS = 30;
const MAX_TRIPS = 60;

const EMPTY: Library = { home: null, work: null, favs: [], recents: [], trips: [] };

function load(): Library {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Library>) };
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return EMPTY;
}

const persist = (l: Library) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
};

const samePlace = (a: Place, b: Place) =>
  a.id === b.id || (Math.abs(a.lngLat[0] - b.lngLat[0]) < 1e-4 && Math.abs(a.lngLat[1] - b.lngLat[1]) < 1e-4);

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

interface LibraryState extends Library {
  setHome: (p: Place | null) => void;
  setWork: (p: Place | null) => void;
  isFav: (p: Place) => Fav | undefined;
  toggleFav: (p: Place) => void;
  renameFav: (id: string, label: string) => void;
  removeFav: (id: string) => void;
  pushRecent: (p: Place) => void;
  removeRecent: (id: string) => void;
  clearRecents: () => void;
  addTrip: (t: Omit<Trip, 'id' | 'at' | 'started' | 'pinned'>) => string;
  markStarted: (id: string) => void;
  pinTrip: (id: string, pinned: boolean, name?: string) => void;
  removeTrip: (id: string) => void;
  clearTrips: () => void;
  exportJson: () => string;
  importJson: (json: string) => boolean;
  wipe: () => void;
}

export const useLibrary = create<LibraryState>((set, get) => {
  const commit = (patch: Partial<Library>) => {
    const { home, work, favs, recents, trips } = { ...get(), ...patch };
    persist({ home, work, favs, recents, trips });
    set(patch);
  };
  return {
    ...load(),
    setHome: (p) => commit({ home: p ? { id: 'home', label: 'Home', place: p } : null }),
    setWork: (p) => commit({ work: p ? { id: 'work', label: 'Work', place: p } : null }),
    isFav: (p) => get().favs.find((f) => samePlace(f.place, p)),
    toggleFav: (p) => {
      const have = get().favs.find((f) => samePlace(f.place, p));
      commit({ favs: have ? get().favs.filter((f) => f.id !== have.id) : [{ id: uid(), label: p.title, place: p }, ...get().favs] });
    },
    renameFav: (id, label) => commit({ favs: get().favs.map((f) => (f.id === id ? { ...f, label: label.trim() || f.place.title } : f)) }),
    removeFav: (id) => commit({ favs: get().favs.filter((f) => f.id !== id) }),
    pushRecent: (p) =>
      commit({ recents: [{ place: p, at: Date.now() }, ...get().recents.filter((r) => !samePlace(r.place, p))].slice(0, MAX_RECENTS) }),
    removeRecent: (id) => commit({ recents: get().recents.filter((r) => r.place.id !== id) }),
    clearRecents: () => commit({ recents: [] }),
    addTrip: (t) => {
      const id = uid();
      // planning the same trip again moves it to the top instead of duplicating it
      const rest = get().trips.filter((x) => !(samePlace(x.from, t.from) && samePlace(x.to, t.to) && x.via.length === t.via.length));
      const prev = get().trips.find((x) => samePlace(x.from, t.from) && samePlace(x.to, t.to) && x.via.length === t.via.length);
      commit({ trips: [{ ...t, id, at: Date.now(), started: prev?.started ?? false, pinned: prev?.pinned ?? false, name: prev?.name }, ...rest].slice(0, MAX_TRIPS) });
      return id;
    },
    markStarted: (id) => commit({ trips: get().trips.map((t) => (t.id === id ? { ...t, started: true, at: Date.now() } : t)) }),
    pinTrip: (id, pinned, name) => commit({ trips: get().trips.map((t) => (t.id === id ? { ...t, pinned, name: name ?? t.name } : t)) }),
    removeTrip: (id) => commit({ trips: get().trips.filter((t) => t.id !== id) }),
    clearTrips: () => commit({ trips: get().trips.filter((t) => t.pinned) }),
    exportJson: () => {
      const { home, work, favs, recents, trips } = get();
      return JSON.stringify({ app: 'navi', version: 1, home, work, favs, recents, trips }, null, 2);
    },
    importJson: (json) => {
      try {
        const d = JSON.parse(json) as Partial<Library> & { app?: string };
        if (d.app !== 'navi') return false;
        commit({ home: d.home ?? null, work: d.work ?? null, favs: d.favs ?? [], recents: d.recents ?? [], trips: d.trips ?? [] });
        return true;
      } catch {
        return false;
      }
    },
    wipe: () => commit({ ...EMPTY }),
  };
});
