import { create } from 'zustand';

export type CornerResult = 'clean' | 'sloppy' | 'crash';

export interface GameState {
  score: number;
  streak: number;
  best: number;
  distanceM: number;
  paused: boolean;
  /** a gamepad is connected */
  pad: boolean;
  /** what the car is being asked to do right now, for the on-screen meters */
  throttle: number;
  brake: number;
  steer: number;
  /** the last corner, shown for a moment */
  feedback: { text: string; kind: CornerResult | 'bump' | 'info'; at: number } | null;
  /** a junction ahead: metres to it and how many roads leave it */
  junction: { dist: number; options: number } | null;
  /** the car has come to the end of a road */
  deadEnd: boolean;
  reset: () => void;
}

const FRESH = { score: 0, streak: 0, distanceM: 0, paused: false, pad: false, throttle: 0, brake: 0, steer: 0, feedback: null, junction: null, deadEnd: false } as const;

export const useGame = create<GameState>((set) => ({
  ...FRESH,
  best: readBest(),
  reset: () => set({ ...FRESH }),
}));

const BEST_KEY = 'navi.game.best';
function readBest(): number {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
export function saveBest(v: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.round(v)));
  } catch {
    /* storage unavailable */
  }
}
