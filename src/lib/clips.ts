/**
 * Recorded co-driver voice. Each word was recorded once with a free human-sounding voice model
 * (Kokoro, Apache 2.0) and is joined into calls here, the way GPS units speak. It plays through the
 * same audio context as the beeps, so it does not depend on the phone's built-in speech engine.
 * Anything it cannot read (a driver's own typed words) falls back to the phone's voice.
 * With the premium or on-phone voice switched on, whole calls made ahead of the ride are played instead, and the
 * recorded words cover any call that is not ready.
 */
import { audioContext } from './audio';
import { setSpeechEstimator } from '@/core';
import { planClips } from './clipPlan';
import { premiumBuffers, premiumDurationMs, premiumFetch, premiumOn, premiumOnline, takePause } from './premium';
import { useApp } from './store';

export type ClipVoice = 'george' | 'michael' | 'emma' | 'heart';
// more voices are added here as their sentence-level recordings are finished
export const CLIP_VOICES: { id: ClipVoice; name: string; blurb: string }[] = [
  { id: 'george', name: 'George', blurb: 'British man' },
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
  return { on: s.voiceEngine === 'recorded' || ((s.voiceEngine === 'premium' || s.voiceEngine === 'ondevice' || s.voiceEngine === 'home') && premiumOn()), id: s.clipVoice };
}

/** Start loading the chosen voice as soon as the app (or the setting) asks for it. */
export function warmClips(): void {
  const w = wanted();
  if (w.on && typeof window !== 'undefined') void loadVoicePack(w.id);
}

const speedFor = (rate: number) => Math.min(1.2, Math.max(0.9, rate / 1.1));

/** A call ready to be placed on the timeline. */
interface Take {
  /** seconds of audio at normal speed, including pauses */
  sec: number;
  place(ctx: AudioContext, gain: GainNode, t0: number, speed: number): { end: number; srcs: AudioBufferSourceNode[] };
}

function recordedTake(text: string): Take | null {
  if (!pack) return null;
  const p = pack;
  const plan = planClips(text, (k) => k in p.clips);
  if (!plan) return null;
  let sec = 0;
  for (const st of plan) sec += st.pauseMs / 1000 + p.clips[st.key][1];
  return {
    sec,
    place(ctx, gain, t0, speed) {
      let t = t0;
      const srcs: AudioBufferSourceNode[] = [];
      for (const step of plan) {
        const [start, len] = p.clips[step.key];
        t += step.pauseMs / 1000 / speed;
        const src = ctx.createBufferSource();
        src.buffer = p.buf;
        src.playbackRate.value = speed;
        src.connect(gain);
        src.start(t, start, len);
        srcs.push(src);
        t += len / speed;
      }
      return { end: t, srcs };
    },
  };
}

function premiumTake(bufs: AudioBuffer[]): Take {
  return {
    sec: bufs.reduce((a, b) => a + b.duration, 0) + takePause * (bufs.length - 1),
    place(ctx, gain, t0, speed) {
      let t = t0;
      const srcs: AudioBufferSourceNode[] = [];
      bufs.forEach((b, i) => {
        if (i) t += takePause / speed;
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.playbackRate.value = speed;
        src.connect(gain);
        src.start(t);
        srcs.push(src);
        t += b.duration / speed;
      });
      return { end: t, srcs };
    },
  };
}

/** The best take available right now: prepared premium audio, else the recorded words. */
function takeFor(text: string): Take | null {
  if (premiumOn()) {
    const b = premiumBuffers(text);
    if (b) return premiumTake(b);
  }
  return recordedTake(text);
}

/** How long a call takes with the recorded or premium voice (ms), or null when neither will be used for it. */
export function clipDurationMs(text: string, rate: number): number | null {
  const w = wanted();
  if (!w.on) return null;
  const speed = speedFor(rate);
  if (premiumOn()) {
    const d = premiumDurationMs(text, speed);
    if (d !== null) return d;
  }
  if (pack?.id !== w.id) return null;
  const t = recordedTake(text);
  return t ? Math.round(t.sec / speed * 1000 + 60) : null;
}

interface Opts {
  rate: number;
  volume?: number;
  onStart?: () => void;
  onDone?: () => void;
}
interface Queued {
  take: Take;
  o: Opts;
}
let queued: Queued[] = [];
/** audio-context time at which the call now playing ends */
let endsAt = 0;

export function stopClips(): void {
  clearTimeout(doneTimer);
  queued = [];
  endsAt = 0;
  for (const s of active) {
    try {
      s.stop();
    } catch {
      /* already finished */
    }
  }
  active = [];
}

function schedule(ctx: AudioContext, take: Take, o: Opts): boolean {
  void ctx.resume();
  const speed = speedFor(o.rate);
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, Math.max(0, o.volume ?? 1));
  gain.connect(ctx.destination);
  const { end, srcs } = take.place(ctx, gain, ctx.currentTime + 0.03, speed);
  active.push(...srcs);
  endsAt = end;
  o.onStart?.();
  clearTimeout(doneTimer);
  doneTimer = setTimeout(() => {
    o.onDone?.();
    // keep the list of live sources short
    active = [];
    const q = queued.shift();
    if (q) {
      const c = audioContext();
      if (c) schedule(c, q.take, q.o);
    }
  }, Math.max(0, (end - ctx.currentTime) * 1000));
  return true;
}

/** Play now, or wait behind the call that is playing; `interrupt` cuts the current call off. */
function enqueue(ctx: AudioContext, take: Take, o: Opts & { interrupt?: boolean }): boolean {
  const playing = endsAt > ctx.currentTime;
  if (playing && !o.interrupt) {
    queued.push({ take, o });
    if (queued.length > 4) queued.shift(); // a long backlog is stale: drop the oldest
    return true;
  }
  stopClips();
  return schedule(ctx, take, o);
}

/**
 * Speak a call from recordings or prepared premium audio. Returns false when it cannot (voice off, no audio
 * context, or a word with no recording), so the caller can use the phone's voice instead.
 * A call that arrives while another is still playing waits its turn, in order; `interrupt` cuts the current
 * call off, for urgent warnings. `fallback` runs if the call was accepted but could not be spoken after all.
 */
export function playClips(text: string, o: Opts & { interrupt?: boolean; fallback?: () => void }): boolean {
  const w = wanted();
  if (!w.on) return false;
  const ctx = audioContext();
  if (!ctx || ctx.state === 'closed') return false;

  // premium voice, call not prepared: fetch it now if there is signal, with the recorded words as the safety net
  if (premiumOn() && !premiumBuffers(text) && premiumOnline()) {
    const cover = () => {
      const t = recordedTake(text);
      if (t) return enqueue(ctx, t, o);
      return false;
    };
    // a warning cannot wait for the network
    if (o.interrupt) {
      void premiumFetch(text).catch(() => undefined);
      return pack?.id === w.id && cover();
    }
    let settled = false;
    const finish = (use: () => boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!use()) o.fallback?.();
    };
    const timer = setTimeout(() => finish(cover), 2200);
    premiumFetch(text).then(
      (bufs) => finish(() => enqueue(ctx, premiumTake(bufs), o)),
      () => finish(cover),
    );
    return true;
  }

  if (!premiumBuffers(text) && pack?.id !== w.id) {
    const pend = loading?.id === w.id ? loading.p : undefined;
    const p = pend ?? loadVoicePack(w.id);
    // the voice is still loading (the first seconds of a ride): hold the call and speak it the moment it is ready,
    // instead of falling back to the phone voice, which iPhones often drop
    if (pend || !failed) {
      void p.then((ok) => {
        if (ok) playClips(text, o);
        else o.fallback?.();
      });
      return true;
    }
    return false;
  }
  const take = takeFor(text);
  if (!take) return false;
  return enqueue(ctx, take, o);
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
  setSpeechEstimator(clipDurationMs);
}
