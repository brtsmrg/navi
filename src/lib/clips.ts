/**
 * Recorded co-driver voice. Each word was recorded once with a free human-sounding voice model
 * (Kokoro, Apache 2.0) and is joined into calls here, the way GPS units speak. It plays through the
 * same audio context as the beeps, so it does not depend on the phone's built-in speech engine.
 * Anything it cannot read (a driver's own typed words) falls back to the phone's voice.
 */
import { audioContext } from './audio';
import { planClips } from './clipPlan';
import { useApp } from './store';

export type ClipVoice = 'george' | 'michael' | 'emma' | 'heart';
export const CLIP_VOICES: { id: ClipVoice; name: string; blurb: string }[] = [
  { id: 'george', name: 'George', blurb: 'British man' },
  { id: 'michael', name: 'Michael', blurb: 'American man' },
  { id: 'emma', name: 'Emma', blurb: 'British woman' },
  { id: 'heart', name: 'Heart', blurb: 'American woman' },
];

interface Pack {
  id: ClipVoice;
  buf: AudioBuffer;
  clips: Record<string, [number, number]>;
}

let pack: Pack | undefined;
let loading: { id: ClipVoice; p: Promise<boolean> } | undefined;
let failed: ClipVoice | undefined;
let active: AudioBufferSourceNode[] = [];
let doneTimer: ReturnType<typeof setTimeout> | undefined;

const url = (name: string) => new URL(`voices/${name}`, document.baseURI).toString();

/** Fetch and decode a voice pack. Safe to call often. Resolves true when the voice is ready. */
export function loadVoicePack(id: ClipVoice): Promise<boolean> {
  if (pack?.id === id) return Promise.resolve(true);
  if (loading?.id === id) return loading.p;
  const p = (async () => {
    try {
      const [man, mp3] = await Promise.all([fetch(url(`${id}.json`)).then((r) => r.json() as Promise<{ clips: Record<string, [number, number]> }>), fetch(url(`${id}.mp3`)).then((r) => r.arrayBuffer())]);
      const dec = new OfflineAudioContext(1, 1, 24000);
      const buf = await dec.decodeAudioData(mp3);
      pack = { id, buf, clips: man.clips };
      failed = undefined;
      return true;
    } catch {
      failed = id;
      return false;
    } finally {
      if (loading?.id === id) loading = undefined;
    }
  })();
  loading = { id, p };
  return p;
}

export const clipsReady = () => !!pack;
export const clipsFailed = () => failed;

function wanted(): { on: boolean; id: ClipVoice } {
  const s = useApp.getState().settings;
  return { on: s.voiceEngine === 'recorded', id: s.clipVoice };
}

/** Start loading the chosen voice as soon as the app (or the setting) asks for it. */
export function warmClips(): void {
  const w = wanted();
  if (w.on && typeof window !== 'undefined') void loadVoicePack(w.id);
}

export function stopClips(): void {
  clearTimeout(doneTimer);
  for (const s of active) {
    try {
      s.stop();
    } catch {
      /* already finished */
    }
  }
  active = [];
}

/**
 * Speak a call from recordings. Returns false when it cannot (voice off, not loaded yet, no audio
 * context, or a word with no recording), so the caller can use the phone's voice instead.
 */
export function playClips(text: string, o: { rate: number; volume?: number; onStart?: () => void; onDone?: () => void }): boolean {
  const w = wanted();
  if (!w.on) return false;
  if (pack?.id !== w.id) {
    void loadVoicePack(w.id);
    return false;
  }
  const ctx = audioContext();
  if (!ctx || ctx.state === 'closed') return false;
  const plan = planClips(text, (k) => k in pack!.clips);
  if (!plan) return false;
  stopClips();
  void ctx.resume();
  const speed = Math.min(1.2, Math.max(0.9, o.rate / 1.1));
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, Math.max(0, o.volume ?? 1));
  gain.connect(ctx.destination);
  let t = ctx.currentTime + 0.03;
  for (const step of plan) {
    const [start, len] = pack.clips[step.key];
    t += step.pauseMs / 1000 / speed;
    const src = ctx.createBufferSource();
    src.buffer = pack.buf;
    src.playbackRate.value = speed;
    src.connect(gain);
    src.start(t, start, len);
    active.push(src);
    t += len / speed;
  }
  o.onStart?.();
  doneTimer = setTimeout(() => o.onDone?.(), Math.max(0, (t - ctx.currentTime) * 1000));
  return true;
}

if (typeof window !== 'undefined') {
  // load the chosen voice up front, and again whenever the choice changes
  let last = '';
  useApp.subscribe((st) => {
    const k = `${st.settings.voiceEngine}:${st.settings.clipVoice}`;
    if (k !== last) {
      last = k;
      warmClips();
    }
  });
  setTimeout(warmClips, 0);
}
