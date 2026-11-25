/**
 * Game controls: a gamepad (Gamepad API), the keyboard, or on-screen buttons. All three are read together, so
 * the strongest push wins. Nothing here leaves the phone.
 *
 * Gamepad (standard layout): left stick or d-pad left/right steers, right trigger or A is gas, left trigger or B is brake,
 * Start pauses, Y turns the car around.
 * Keyboard: arrows or WASD, P or Escape pauses, T turns around.
 */
export interface GameInput {
  /** -1 left .. +1 right */
  steer: number;
  throttle: number;
  brake: number;
  pause: boolean;
  turn: boolean;
  pad: boolean;
}

const keys = new Set<string>();
const touch = { steer: 0, throttle: 0, brake: 0 };
const edge = { pause: false, turn: false };
let attached = 0;
const DEAD = 0.15;

const onDown = (e: KeyboardEvent) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'p' || k === 'escape') edge.pause = true;
  if (k === 't') edge.turn = true;
  keys.add(k);
};
const onUp = (e: KeyboardEvent) => void keys.delete(e.key.toLowerCase());

/** Start listening for the keyboard. Returns the function that stops it. */
export function attachKeys(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (attached++ === 0) {
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
  }
  return () => {
    if (--attached === 0) {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      keys.clear();
    }
  };
}

/** On-screen buttons call this. */
export function setTouch(p: Partial<typeof touch>): void {
  Object.assign(touch, p);
}
export function pressEdge(what: 'pause' | 'turn'): void {
  edge[what] = true;
}
export function resetInput(): void {
  keys.clear();
  touch.steer = touch.throttle = touch.brake = 0;
  edge.pause = edge.turn = false;
  padPrev.pause = padPrev.turn = false;
}

const padPrev = { pause: false, turn: false };
const dz = (v: number) => (Math.abs(v) < DEAD ? 0 : (Math.sign(v) * (Math.abs(v) - DEAD)) / (1 - DEAD));

function activePad(): Gamepad | null {
  const list = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const g of list) if (g && g.connected) return g;
  return null;
}

export function readInput(): GameInput {
  let steer = touch.steer;
  let throttle = touch.throttle;
  let brake = touch.brake;
  if (keys.has('arrowleft') || keys.has('a')) steer = Math.min(steer, -1);
  if (keys.has('arrowright') || keys.has('d')) steer = Math.max(steer, 1);
  if (keys.has('arrowup') || keys.has('w')) throttle = 1;
  if (keys.has('arrowdown') || keys.has('s') || keys.has(' ')) brake = 1;
  let pause = edge.pause;
  let turn = edge.turn;
  edge.pause = edge.turn = false;

  const g = activePad();
  if (g) {
    const b = (i: number) => g.buttons[i]?.value ?? 0;
    const stick = dz(g.axes[0] ?? 0);
    const dpad = b(15) - b(14);
    const padSteer = Math.abs(stick) > Math.abs(dpad) ? stick : dpad;
    if (Math.abs(padSteer) > Math.abs(steer)) steer = padSteer;
    throttle = Math.max(throttle, b(7), b(0));
    brake = Math.max(brake, b(6), b(1));
    const p = (g.buttons[9]?.pressed ?? false) || (g.buttons[8]?.pressed ?? false);
    const t = g.buttons[3]?.pressed ?? false;
    if (p && !padPrev.pause) pause = true;
    if (t && !padPrev.turn) turn = true;
    padPrev.pause = p;
    padPrev.turn = t;
  }
  return { steer: Math.max(-1, Math.min(1, steer)), throttle: Math.max(0, Math.min(1, throttle)), brake: Math.max(0, Math.min(1, brake)), pause, turn, pad: !!g };
}

/** Shake the controller for a moment (crashes and bumps). Silently does nothing where it is not supported. */
export function rumble(strong: number, ms: number): void {
  const g = activePad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null;
  try {
    void g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 });
  } catch {
    /* not supported */
  }
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
