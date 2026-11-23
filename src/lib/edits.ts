import { create } from 'zustand';
import { isEmptyEdit, type EditMap, type NoteEdit } from '@/core';

const KEY = 'navi.edits.v1';

type ByRoute = Record<string, EditMap>;

function load(): ByRoute {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ByRoute;
  } catch {
    /* storage unavailable or damaged: start clean */
  }
  return {};
}

function save(v: ByRoute) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

interface EditsState {
  byRoute: ByRoute;
  /** Replace the edit for one note. An empty or missing edit removes it. */
  put: (route: string, noteId: string, edit: NoteEdit | undefined) => void;
  clearRoute: (route: string) => void;
}

/** Pacenote edits, saved on this device against each route. */
export const useEdits = create<EditsState>((set, get) => ({
  byRoute: load(),
  put: (route, noteId, edit) => {
    const all = { ...get().byRoute };
    const map = { ...(all[route] ?? {}) };
    if (isEmptyEdit(edit)) delete map[noteId];
    else map[noteId] = edit as NoteEdit;
    if (Object.keys(map).length === 0) delete all[route];
    else all[route] = map;
    save(all);
    set({ byRoute: all });
  },
  clearRoute: (route) => {
    const all = { ...get().byRoute };
    delete all[route];
    save(all);
    set({ byRoute: all });
  },
}));

export function editsFor(route: string | undefined): EditMap | undefined {
  return route ? useEdits.getState().byRoute[route] : undefined;
}
