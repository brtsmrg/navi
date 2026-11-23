/** Speech: recorded co-driver clips first, the phone's built-in voice (Web Speech API) as the fallback. Nothing leaves the phone. */
import { playClips, stopClips } from './clips';

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
}

export type SpeechStatus = 'unsupported' | 'loading' | 'no-voice' | 'ready' | 'error';

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Joke and novelty voices that ship with iOS and macOS: never a good co-driver. */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|rocko|eddy|flo|grandma|grandpa|reed|sandy|shelley/i;
/** Natural-sounding voices, roughly best first. */
const NICE = ['ava', 'zoe', 'evan', 'nicky', 'samantha', 'allison', 'tom', 'daniel', 'karen', 'moira', 'serena', 'oliver', 'kate', 'google uk english', 'google us english', 'natural'];

/** Higher is better: premium and enhanced voices first, then natural names, local voices, English (CA, GB, US). */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }): number {
  if (NOVELTY.test(v.name)) return -100;
  let n = 0;
  if (/premium/i.test(v.name)) n += 50;
  else if (/enhanced|natural|neural/i.test(v.name)) n += 40;
  if (/compact/i.test(v.name)) n -= 20;
  const i = NICE.findIndex((x) => v.name.toLowerCase().includes(x));
  if (i >= 0) n += 20 - i;
  if (/en[-_](CA|GB|US|AU)/i.test(v.lang)) n += 5;
  if (v.localService) n += 2;
  return n;
}

export function listVoices(): VoiceInfo[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

/** Voices load late on Chrome and Safari. Resolves with the English voices, or [] after the wait. */
export function waitForVoices(ms = 1500): Promise<VoiceInfo[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const have = listVoices();
  if (have.length) return Promise.resolve(have);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      clearTimeout(t);
      resolve(listVoices());
    };
    const t = setTimeout(done, ms);
    window.speechSynthesis.addEventListener('voiceschanged', done);
  });
}

function pick(uri: string): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices();
  const chosen = all.find((v) => v.voiceURI === uri);
  if (chosen) return chosen;
  return all.filter((v) => v.lang.toLowerCase().startsWith('en')).sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

let lastError = '';
export const lastSpeechError = () => lastError;
// Chrome can drop an utterance if nothing holds a reference to it, so keep the live one here.
export let live: SpeechSynthesisUtterance | undefined;
let speakTimer: ReturnType<typeof setTimeout> | undefined;

export function say(text: string, o: { rate: number; voiceURI: string; volume?: number; interrupt?: boolean; onDone?: () => void; onStart?: () => void; onFail?: () => void; noRetry?: boolean }): void {
  if (playClips(text, { rate: o.rate, volume: o.volume, onStart: o.onStart, onDone: o.onDone })) {
    // recorded voice took the call: make sure the phone voice is not also speaking an old one
    if (speechSupported()) window.speechSynthesis.cancel();
    clearTimeout(speakTimer);
    live = undefined;
    return;
  }
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  clearTimeout(speakTimer);
  const stale = o.interrupt || synth.pending || synth.speaking;
  // never let a backlog build up: stale calls are worse than silence
  if (stale) synth.cancel();
  const go = (retry: boolean) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = o.rate;
    u.volume = o.volume ?? 1;
    u.lang = 'en-US'; // a bare 'en' finds no voice on some iPhones until the voice list has loaded, so early calls were silent
    const v = pick(o.voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    let started = false;
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') lastError = e.error;
    };
    u.onstart = () => {
      started = true;
      o.onStart?.();
    };
    u.onend = () => o.onDone?.();
    live = u;
    synth.resume(); // Chrome can be left paused after a cancel
    synth.speak(u);
    // Some phones silently drop a call that was started from a timer. If it has not started in
    // a moment, clear the queue and say it once more; if that fails too, tell the driver why.
    setTimeout(() => {
      if (started || live !== u || o.noRetry) return;
      if (!retry) {
        synth.cancel();
        speakTimer = setTimeout(() => go(true), 200);
      } else o.onFail?.();
    }, 1500);
  };
  // speaking in the same tick as cancel() is silently dropped by Chrome and some WebKit builds
  if (stale) speakTimer = setTimeout(() => go(false), 200);
  else go(false);
}

export function stopSpeaking(): void {
  stopClips();
  clearTimeout(speakTimer);
  live = undefined;
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** iOS only lets speech start from a user gesture: call this inside the Start button handler. */
export function primeSpeech(): void {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
