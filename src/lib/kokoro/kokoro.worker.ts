/**
 * Runs the Kokoro-82M voice model on the phone, in a background thread, so the screen stays smooth while it works.
 * Kokoro is an Apache 2.0 text-to-speech model. The 8-bit model file (about 92 MB) is downloaded once from Hugging Face and
 * kept in the browser's own storage. Text goes to phonemes (the sounds of the words) with a word list, then the model turns
 * the sounds into speech. Nothing here talks to any server except the one-off model download.
 * The steps follow the open-source kokoro-js library (Apache 2.0).
 */
import * as ort from 'onnxruntime-web/wasm';
import LEXICON from './lexicon.json';
import { MODEL_URL, VOICE_URL } from './urls';
import { VOCAB } from './vocab';

const STORE = 'navi-kokoro-1';
const STYLE_DIM = 256;
const SAMPLE_RATE = 24000;

export type ToWorker =
  | { type: 'init' }
  | { type: 'synth'; id: number; text: string; voice: string; speed: number };
export type FromWorker =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'audio'; id: number; pcm: Int16Array }
  | { type: 'error'; id?: number; code: 'network' | 'other' | 'unknown'; message: string };

let session: ort.InferenceSession | undefined;
const voices = new Map<string, Float32Array>();

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

/** Fetch a file once, show progress, and keep it in the browser's cache storage for next time. */
async function stored(url: string, onProgress?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(STORE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
  } catch {
    cache = undefined;
  }
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const blob = new Blob(parts);
  try {
    await cache?.put(url, new Response(blob, { headers: { 'content-type': 'application/octet-stream' } }));
  } catch {
    /* storage full or blocked: still usable this time */
  }
  return blob.arrayBuffer();
}

async function loadModel(): Promise<void> {
  if (session) return;
  ort.env.wasm.numThreads = 1; // more threads need special web-server headers that this kind of hosting cannot send
  ort.env.wasm.proxy = false;
  const bytes = await stored(MODEL_URL, (loaded, total) => post({ type: 'progress', loaded, total }));
  session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function loadVoice(id: string): Promise<Float32Array> {
  const have = voices.get(id);
  if (have) return have;
  const bytes = await stored(VOICE_URL(id));
  const v = new Float32Array(bytes);
  voices.set(id, v);
  return v;
}

// ---- text to phonemes to tokens ----
// Every word the co-driver can say is looked up in a word list (made by scripts/make-lexicon.py), so no pronunciation engine
// has to ship in the app. A word that is not in the list cannot be made; that call stays with the recorded voice.
const PUNCT = /[;:,.!?¡¿—…"]+/g;

export class UnknownWord extends Error {}

export function toPhonemes(text: string, american: boolean): string {
  const lex = american ? LEXICON.us : LEXICON.gb;
  const pieces: string[] = [];
  let last = 0;
  const speak = (chunk: string) => {
    const words = chunk.toLowerCase().split(/\s+/).filter(Boolean);
    return words
      .map((w) => {
        const p = (lex as Record<string, string>)[w];
        if (p === undefined) throw new UnknownWord(`no pronunciation for "${w}"`);
        return p;
      })
      .join(' ');
  };
  for (const m of text.trim().matchAll(PUNCT)) {
    const at = m.index ?? 0;
    if (last < at) pieces.push(speak(text.trim().slice(last, at)));
    pieces.push(m[0]);
    last = at + m[0].length;
  }
  const rest = text.trim().slice(last);
  if (rest.trim()) pieces.push(speak(rest));
  // a space after each stop or comma keeps the phrases apart
  return pieces.join(' ').replace(/ ([;:,.!?¡¿—…"]+)/g, '$1').replace(/([;:,.!?¡¿—…"]+)(?=\S)/g, '$1 ').trim();
}

export function toTokens(phonemes: string): number[] {
  const ids: number[] = [];
  for (const ch of phonemes) {
    const id = VOCAB[ch];
    if (id !== undefined) ids.push(id);
  }
  return [0, ...ids.slice(0, 510), 0];
}

/** Cut the silence off both ends (the driver is waiting for the call), fade the edges, and make the loudness even. */
export function finish(wave: Float32Array): Int16Array {
  let peak = 0;
  for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]));
  if (peak < 1e-4) return new Int16Array(0);
  const floor = peak * 0.04;
  let a = 0;
  let b = wave.length - 1;
  while (a < b && Math.abs(wave[a]) < floor) a++;
  while (b > a && Math.abs(wave[b]) < floor) b--;
  const pad = Math.round(SAMPLE_RATE * 0.025);
  a = Math.max(0, a - pad);
  b = Math.min(wave.length - 1, b + pad);
  const n = b - a + 1;
  const out = new Int16Array(n);
  const gain = 0.92 / peak;
  const fade = Math.min(n >> 1, Math.round(SAMPLE_RATE * 0.012));
  for (let i = 0; i < n; i++) {
    let g = gain;
    if (i < fade) g *= i / fade;
    else if (n - 1 - i < fade) g *= (n - 1 - i) / fade;
    out[i] = Math.max(-32767, Math.min(32767, Math.round(wave[a + i] * g * 32767)));
  }
  return out;
}

async function synth(text: string, voice: string, speed: number): Promise<Int16Array> {
  if (!session) throw new Error('model not loaded');
  const style = await loadVoice(voice);
  const tokens = toTokens(toPhonemes(text, voice.startsWith('a')));
  const count = Math.min(Math.max(tokens.length - 2, 0), 509);
  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames.includes('input_ids') ? 'input_ids' : 'tokens']: new ort.Tensor('int64', BigInt64Array.from(tokens, (t) => BigInt(t)), [1, tokens.length]),
    style: new ort.Tensor('float32', style.slice(count * STYLE_DIM, (count + 1) * STYLE_DIM), [1, STYLE_DIM]),
    speed: new ort.Tensor('float32', new Float32Array([speed]), [1]),
  };
  const out = await session.run(feeds);
  const wave = out[session.outputNames[0]].data as Float32Array;
  return finish(wave);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  void (async () => {
    if (m.type === 'init') {
      try {
        await loadModel();
        post({ type: 'ready' });
      } catch (err) {
        post({ type: 'error', code: err instanceof TypeError ? 'network' : 'other', message: String(err instanceof Error ? err.message : err) });
      }
    } else {
      try {
        const pcm = await synth(m.text, m.voice, m.speed);
        post({ type: 'audio', id: m.id, pcm }, [pcm.buffer]);
      } catch (err) {
        post({ type: 'error', id: m.id, code: err instanceof UnknownWord ? 'unknown' : err instanceof TypeError ? 'network' : 'other', message: String(err instanceof Error ? err.message : err) });
      }
    }
  })();
};
