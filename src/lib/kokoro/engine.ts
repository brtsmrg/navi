/**
 * The free on-phone voice (Kokoro). This is the main-thread side: it starts the background worker, hands it text,
 * and gets speech back. The worker is shut down when a road's calls are made, to give the phone its memory back.
 */
import type { FromWorker, ToWorker } from './kokoro.worker';

export const DEVICE_VOICES = [
  { id: 'bm_lewis', name: 'Lewis', blurb: 'British man, sharp and urgent' },
  { id: 'bm_george', name: 'George', blurb: 'British man, steady' },
  { id: 'am_adam', name: 'Adam', blurb: 'American man, deep' },
  { id: 'am_michael', name: 'Michael', blurb: 'American man, clear' },
  { id: 'bf_emma', name: 'Emma', blurb: 'British woman' },
  { id: 'af_heart', name: 'Heart', blurb: 'American woman, warm' },
] as const;
export type DeviceVoice = (typeof DEVICE_VOICES)[number]['id'];

/** How fast the model speaks. Higher than normal gives the clipped, hurried co-driver pace. */
export const DEVICE_SPEED = 1.28;
/** Bump when the speaking style or the text rules change, so old audio is not reused. */
export const DEVICE_STYLE_VERSION = 1;
export const DEVICE_RATE = 24000;

export class DeviceVoiceError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'other' | 'unknown',
  ) {
    super(message);
  }
}

/** A call's words, set up for an urgent read: each take ends with an exclamation mark instead of a full stop. */
export const urgentText = (seg: string) => seg.replace(/\.$/, '!');

interface Pending {
  resolve: (pcm: Int16Array) => void;
  reject: (e: Error) => void;
}

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();
let onProgress: ((loaded: number, total: number) => void) | undefined;
let readyHandlers: { resolve: () => void; reject: (e: Error) => void } | undefined;

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    readyHandlers = { resolve, reject };
    const w = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.loaded, m.total);
      else if (m.type === 'ready') readyHandlers?.resolve();
      else if (m.type === 'audio') {
        pending.get(m.id)?.resolve(m.pcm);
        pending.delete(m.id);
      } else if (m.id !== undefined) {
        pending.get(m.id)?.reject(new DeviceVoiceError(m.message, m.code));
        pending.delete(m.id);
      } else {
        readyHandlers?.reject(new DeviceVoiceError(m.code === 'network' ? 'The voice file could not be downloaded. Check the signal and try again.' : m.message, m.code));
      }
    };
    w.onerror = () => readyHandlers?.reject(new DeviceVoiceError('The voice could not start on this phone.', 'other'));
    const init: ToWorker = { type: 'init' };
    w.postMessage(init);
  });
  ready.catch(() => release());
  return ready;
}

/** Get the voice ready: downloads the model the first time (about 92 MB), then loads it. */
export function deviceStart(progress?: (loaded: number, total: number) => void): Promise<void> {
  onProgress = progress;
  return start();
}

/** Speak one take into audio (16-bit samples at 24 kHz). */
export async function deviceSynth(seg: string, voice: DeviceVoice, signal?: AbortSignal): Promise<Int16Array> {
  await start();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const id = nextId++;
  return new Promise<Int16Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    signal?.addEventListener('abort', () => {
      pending.delete(id);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
    worker?.postMessage({ type: 'synth', id, text: urgentText(seg), voice, speed: DEVICE_SPEED } satisfies ToWorker);
  });
}

/** Shut the worker down and give its memory back. The next use starts it again. */
export function release(): void {
  worker?.terminate();
  worker = undefined;
  ready = undefined;
  for (const p of pending.values()) p.reject(new DeviceVoiceError('The voice stopped.', 'other'));
  pending.clear();
}
