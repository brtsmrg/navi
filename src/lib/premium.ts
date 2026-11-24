/**
 * Premium co-driver voice. Each call is spoken by OpenAI's text-to-speech model, told to sound like an
 * urgent rally co-driver, using the driver's own API key. Calls are made ahead of the ride ("Prepare voice")
 * and kept on the phone, so the ride itself needs no signal. A call that was not prepared is fetched on the
 * spot when there is signal, and the recorded voice covers any call that cannot be fetched in time.
 *
 * The key lives only in this phone's settings and is sent only to api.openai.com over HTTPS.
 */
import { CallScheduler, speedProfile, drive, roundGap, type Stage } from '@/core';
import { numberWords } from './clipPlan';
import { useApp, type Settings } from './store';

export const PREMIUM_VOICES = [
  { id: 'ash', name: 'Ash', blurb: 'man, clear and steady' },
  { id: 'onyx', name: 'Onyx', blurb: 'man, deep' },
  { id: 'echo', name: 'Echo', blurb: 'man, bright' },
  { id: 'verse', name: 'Verse', blurb: 'man, expressive' },
  { id: 'coral', name: 'Coral', blurb: 'woman, warm' },
  { id: 'shimmer', name: 'Shimmer', blurb: 'woman, light' },
] as const;
export type PremiumVoice = (typeof PREMIUM_VOICES)[number]['id'];

const MODEL = 'gpt-4o-mini-tts';
/** Bump when the instructions change, so old audio is not reused. */
const STYLE_VERSION = 1;
const INSTRUCTIONS =
  'You are an experienced rally co-driver reading pacenotes to the driver at speed. Voice: confident, urgent, clipped and energetic, ' +
  'like someone who is fully focused and a little hurried. Stress the direction and the number in each corner call and keep a steady, ' +
  'driving rhythm. Short natural pauses at commas, no long gaps, no drifting down in energy, no chatty or friendly tone. ' +
  'Say a distance quickly and crisply. A warning such as "careful" or "slow" is sharper and louder.';
const PAUSE_S = 0.12;
const ENDPOINT = 'https://api.openai.com/v1/audio/speech';

/** Digits to words, the way the recorded voice reads them ("150" is "one fifty" in co-driver style). */
export function spokenForm(text: string): string {
  const ORD: Record<string, string> = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth' };
  let out = text.replace(/\b[1-9]\d?(?:st|nd|rd|th)\b/gi, (m) => ORD[m.toLowerCase()] ?? m);
  out = out.replace(/\b\d+\b(?=(\s*)([a-z]*))/gi, (m, _sp: string, nextWord: string) => {
    const w = numberWords(Number(m), /^(metres|meters|feet)$/i.test(nextWord));
    return w.length ? w.join(' ') : m;
  });
  out = out.replace(/\s+/g, ' ').trim();
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

/** A call is spoken as at most two takes: the distance lead-in ("Careful. In two hundred metres,") and the rest. */
export function splitSegments(text: string): string[] {
  const spoken = spokenForm(text);
  const m = /^((?:(?:careful|caution)\.\s+)?in [a-z ]+? (?:metres|feet),)\s+(.+)$/i.exec(spoken);
  return m ? [m[1], m[2]] : [spoken];
}

const cacheKey = (voice: string, seg: string) => `${MODEL}|${STYLE_VERSION}|${voice}|${seg}`;

// ---- storage: decoded audio in memory, the mp3 bytes in IndexedDB so they survive a restart ----
const mem = new Map<string, AudioBuffer>();

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const r = indexedDB.open('navi-premium-voice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}
let dbp: Promise<IDBDatabase | null> | undefined;
const db = () => (dbp ??= openDb());

async function dbGet(key: string): Promise<ArrayBuffer | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    const q = d.transaction('audio').objectStore('audio').get(key);
    q.onsuccess = () => resolve(q.result as ArrayBuffer | undefined);
    q.onerror = () => resolve(undefined);
  });
}
async function dbPut(key: string, bytes: ArrayBuffer): Promise<void> {
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    const t = d.transaction('audio', 'readwrite');
    t.objectStore('audio').put(bytes, key);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}
export async function clearPremiumAudio(): Promise<void> {
  mem.clear();
  const d = await db();
  if (!d) return;
  await new Promise<void>((resolve) => {
    const t = d.transaction('audio', 'readwrite');
    t.objectStore('audio').clear();
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return new OfflineAudioContext(1, 1, 24000).decodeAudioData(bytes.slice(0));
}

export class PremiumError extends Error {
  constructor(
    message: string,
    readonly code: 'key' | 'quota' | 'network' | 'other',
  ) {
    super(message);
  }
}

async function request(seg: string, voice: string, key: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, voice, input: seg, instructions: INSTRUCTIONS, response_format: 'mp3' }),
      signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new PremiumError('No signal, or the voice service could not be reached.', 'network');
  }
  if (res.status === 401) throw new PremiumError('The key was not accepted. Check it was copied in full.', 'key');
  if (res.status === 429) throw new PremiumError('The voice service says the key has no credit left or is going too fast.', 'quota');
  if (!res.ok) throw new PremiumError(`The voice service answered with an error (${res.status}).`, 'other');
  return res.arrayBuffer();
}

const inflight = new Map<string, Promise<AudioBuffer>>();

/** One take: from memory, then the phone's store, then the service. */
async function segmentBuffer(seg: string, voice: string, key: string, signal?: AbortSignal): Promise<AudioBuffer> {
  const k = cacheKey(voice, seg);
  const hit = mem.get(k);
  if (hit) return hit;
  const pending = inflight.get(k);
  if (pending) return pending;
  const p = (async () => {
    let bytes = await dbGet(k);
    if (!bytes) {
      if (!key) throw new PremiumError('No key set.', 'key');
      bytes = await request(seg, voice, key, signal);
      await dbPut(k, bytes);
    }
    const buf = await decode(bytes);
    mem.set(k, buf);
    return buf;
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

const cfg = () => {
  const s = useApp.getState().settings;
  return { on: s.voiceEngine === 'premium' && s.premiumKey.trim().length > 20, key: s.premiumKey.trim(), voice: s.premiumVoice as string };
};

export const premiumOn = () => cfg().on;
export const premiumOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** The takes for a call if every one is already on the phone, else null. */
export function premiumBuffers(text: string): AudioBuffer[] | null {
  const c = cfg();
  if (!c.on) return null;
  const bufs: AudioBuffer[] = [];
  for (const seg of splitSegments(text)) {
    const b = mem.get(cacheKey(c.voice, seg));
    if (!b) return null;
    bufs.push(b);
  }
  return bufs;
}

/** Fetch (or load) every take of a call. Rejects on any failure. */
export async function premiumFetch(text: string, signal?: AbortSignal): Promise<AudioBuffer[]> {
  const c = cfg();
  if (!c.on) throw new PremiumError('Premium voice is off.', 'other');
  return Promise.all(splitSegments(text).map((s) => segmentBuffer(s, c.voice, c.key, signal)));
}

export const takePause = PAUSE_S;

/** How long a prepared call takes, in ms, or null when it is not on the phone yet. */
export function premiumDurationMs(text: string, speed: number): number | null {
  const b = premiumBuffers(text);
  if (!b) return null;
  const sec = b.reduce((a, x) => a + x.duration, 0) + PAUSE_S * (b.length - 1);
  return Math.round((sec / speed) * 1000 + 60);
}

// ---- preparing a route ----

/** Every take the scheduler would need on this stage, at a few cruising speeds, plus the fixed calls. */
export function routeSegments(stage: Stage, s: Settings): string[] {
  const texts = new Set<string>(['Navi is on.', 'Sound check. Left three, right three.', 'Slow', 'Slow down', 'Go', '5', '4', '3', '2', '1']);
  for (const kmh of [50, 70, 90, 110]) {
    const v = speedProfile(stage.path, { cruiseMps: kmh / 3.6, profile: 'road' });
    const samples = drive(stage.path, v, 250);
    const sch = new CallScheduler(stage.notes, { dialect: s.dialect, units: s.units, leadSec: s.leadSec, maxGroup: 3, profile: 'road', speechRate: s.speechRate, brakeMps2: 4 });
    sch.reset(0);
    for (const smp of samples) {
      const c = sch.update(smp.s, smp.v, smp.tMs);
      if (c) texts.add(c.text);
    }
  }
  const segs = new Set<string>();
  for (const t of texts) for (const seg of splitSegments(t)) segs.add(seg);
  // every distance a plain-English lead-in can quote, so a call at an unusual speed is still ready
  if (s.dialect === 'plain' && s.units === 'metric') {
    const seen = new Set<number>();
    for (let m = 60; m <= 800; m += 5) seen.add(roundGap(m));
    for (const d of seen) {
      segs.add(splitSegments(`In ${d} metres, left`)[0]);
      segs.add(splitSegments(`Careful. In ${d} metres, left`)[0]);
    }
  }
  return [...segs];
}

/** The takes in this list that are not on the phone yet. */
export function missingSegments(segs: string[]): string[] {
  const c = cfg();
  return segs.filter((x) => !mem.has(cacheKey(c.voice, x)));
}

/** Rough audio length per take (seconds), to show a cost before anything is spent. */
export const estimateCents = (segs: string[]): number => {
  const sec = segs.reduce((a, x) => a + 0.075 * x.length, 0);
  return Math.max(1, Math.round((sec / 60) * 1.5)); // about 1.5 cents per minute of speech
};

export interface PrepareState {
  done: number;
  total: number;
}

/** Fetch every missing take, three at a time. Resolves when all are on the phone. */
export async function prepareVoice(segs: string[], onProgress: (p: PrepareState) => void, signal: AbortSignal): Promise<void> {
  const c = cfg();
  const todo = missingSegments(segs);
  const total = todo.length;
  let done = 0;
  onProgress({ done, total });
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < todo.length && !failure && !signal.aborted) {
      const seg = todo[next++];
      for (let attempt = 0; ; attempt++) {
        try {
          await segmentBuffer(seg, c.voice, c.key, signal);
          break;
        } catch (e) {
          if (e instanceof PremiumError && e.code === 'other' && attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
            continue;
          }
          failure = e;
          return;
        }
      }
      done++;
      onProgress({ done, total });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (failure) throw failure;
}
