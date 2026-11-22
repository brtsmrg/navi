/** Thin wrapper over the Web Speech API (free, on-device voices; no data leaves the phone). */

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
}

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function listVoices(): VoiceInfo[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

function pick(uri: string): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices();
  return (
    all.find((v) => v.voiceURI === uri) ??
    all.find((v) => /en-(CA|GB)/i.test(v.lang) && !/compact/i.test(v.name)) ??
    all.find((v) => v.lang.toLowerCase().startsWith('en'))
  );
}

export function say(text: string, o: { rate: number; voiceURI: string; interrupt?: boolean }): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  // never let a backlog build up: stale calls are worse than silence
  if (o.interrupt || synth.pending) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = o.rate;
  u.lang = 'en';
  const v = pick(o.voiceURI);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  }
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** iOS only lets speech start from a user gesture: call this inside the Start button handler. */
export function primeSpeech(): void {
  if (!speechSupported()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
