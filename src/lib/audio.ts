/**
 * Sound that works without a voice: short tones panned to the side of the next turn
 * (left ear = left turn, right ear = right turn; higher pitch = tighter corner).
 * Everything is synthesised on the device, so there is no audio file to license.
 * Browsers only allow audio after a tap, so `unlockAudio` must run inside a click handler.
 */

let ctx: AudioContext | undefined;
let keep: HTMLAudioElement | undefined;

/** One second of silence as a WAV, looped so iOS treats the page as "playing media" (plays with the silent switch on). */
function silentWavUri(): string {
  const rate = 8000;
  const n = rate;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, 'data'); dv.setUint32(40, n, true);
  buf.fill(128, 44);
  let bin = '';
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function unlockAudio(): void {
  try {
    // iOS 16.4+: play through the speaker even with the silent switch on
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    /* older browsers: the looped silent clip below does the same job */
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    void ctx?.resume();
    if (!keep) {
      keep = new Audio(silentWavUri());
      keep.loop = true;
      keep.setAttribute('playsinline', '');
    }
    void keep.play().catch(() => undefined);
  } catch {
    /* audio is a bonus: speech and text still work */
  }
}

export function releaseAudio(): void {
  keep?.pause();
}

export const audioReady = () => !!ctx && ctx.state === 'running';

function tone(freq: number, start: number, dur: number, pan: number, gain: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(ctx.destination);
  } else {
    g.connect(ctx.destination);
  }
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Corner cue: two quick tones in the ear of the turn. Tighter corner = higher and one extra tone. */
export function cue(side: 'L' | 'R' | undefined, severity: number, volume: number): void {
  if (!ctx) return;
  void ctx.resume();
  const t = ctx.currentTime + 0.02;
  const pan = side === 'L' ? -1 : side === 'R' ? 1 : 0;
  const f = 520 + (7 - Math.min(6, Math.max(1, severity))) * 110;
  const g = 0.35 * volume;
  tone(f, t, 0.11, pan, g);
  tone(f * 1.25, t + 0.14, 0.11, pan, g);
  if (severity <= 2) tone(f * 1.5, t + 0.28, 0.13, pan, g);
}

/** Plain confirmation: left, right, centre. */
export function testCues(volume: number): void {
  if (!ctx) return;
  void ctx.resume();
  const t = ctx.currentTime + 0.02;
  tone(660, t, 0.18, -1, 0.4 * volume);
  tone(660, t + 0.35, 0.18, 1, 0.4 * volume);
  tone(880, t + 0.7, 0.18, 0, 0.4 * volume);
}

/** Plain-words state of the beep engine, for the Settings sound report. */
export function audioReport(): { ctx: string; session: string } {
  const nav = navigator as unknown as { audioSession?: { type: string } };
  return {
    ctx: ctx ? (ctx.state === 'running' ? 'running' : `${ctx.state} (tap Test beeps)`) : 'not started yet (tap Test beeps)',
    session: nav.audioSession ? `supported (${nav.audioSession.type})` : 'not supported, using a silent clip instead',
  };
}
