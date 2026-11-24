import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Volume2 } from 'lucide-react';
import { DIALECTS, type DialectId, type DriverProfile, type UnitSystem } from '@/core';
import { cn, SEV_COLOR } from '@/lib/cn';
import { useApp, type Readout, type Theme } from '@/lib/store';
import { useLibrary } from '@/lib/library';
import { listVoices, say, speechSupported, waitForVoices, lastSpeechError, type VoiceInfo } from '@/lib/speech';
import { audioReport, testCues, unlockAudio } from '@/lib/audio';
import { CLIP_VOICES, clipsFailed, loadVoicePack, type ClipVoice } from '@/lib/clips';
import { clearPremiumAudio, PREMIUM_VOICES, premiumFetch, PremiumError, type PremiumVoice } from '@/lib/premium';
import { useTraffic } from '@/lib/traffic';
import { VEHICLES } from './vehicles';
import { Button, Range, Segmented, Sheet, Toggle } from './ui';

const PROFILES: { value: DriverProfile; label: string; blurb: string }[] = [
  { value: 'cruise', label: 'Relaxed', blurb: 'Earlier calls, gentle corner speeds.' },
  { value: 'road', label: 'Road', blurb: 'The default for public roads.' },
  { value: 'stage', label: 'Stage', blurb: 'Closed courses only. Later calls, higher corner speeds.' },
];

const READOUTS: { value: Readout; label: string; blurb: string }[] = [
  { value: 'both', label: 'Words + code', blurb: 'Big arrow and "Sharp left", with the short code (L2) beside it.' },
  { value: 'full', label: 'Words only', blurb: 'Big arrow and plain words. No codes.' },
  { value: 'short', label: 'Code only', blurb: 'Rally shorthand: L2, R4, H. For experienced co-driver users.' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}

const KEY: [number, string][] = [[1, 'Hairpin'], [2, 'Sharp'], [3, 'Medium'], [4, 'Easy'], [5, 'Gentle'], [6, 'Almost flat']];

/** What this phone says about sound, so a silent test can be explained instead of guessed at. */
function SoundReport({ voices, tick }: { voices: number; tick: string }) {
  const r = audioReport();
  const lines = [
    `Voice engine: ${speechSupported() ? `yes, ${voices} English voice${voices === 1 ? '' : 's'} listed` : 'not available'}`,
    `Beep engine: ${r.ctx}`,
    `Silent-switch override: ${r.session}`,
    `Last voice error: ${lastSpeechError() || 'none'}`,
    `Build: ${__BUILD__}`,
  ];
  return (
    <details className="rounded-xl bg-bg px-3 py-2 text-sm text-mute" data-tick={tick}>
      <summary className="min-h-8 cursor-pointer py-1 text-ink">Sound report</summary>
      <ul className="space-y-1 pb-1">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </details>
  );
}

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const st = useApp((s) => s.settings);
  const set = useApp((s) => s.set);
  const trafficError = useTraffic((s) => s.error);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceMsg, setVoiceMsg] = useState('');
  const [dataMsg, setDataMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const lib = useLibrary();

  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    void waitForVoices(3000).then(setVoices);
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const sample = st.dialect === 'plain' ? 'In 150 metres, sharp left, then in 100 metres, easy right.' : 'Left 2 long, 100, right 4.';
  const testVoice = () => {
    unlockAudio(); // inside the tap, so iOS and Chrome allow sound
    setVoiceMsg('');
    if (st.voiceEngine === 'premium') {
      if (st.premiumKey.trim().length <= 20) {
        setVoiceMsg('Paste your OpenAI key above first.');
        return;
      }
      setVoiceMsg('Asking the voice service…');
      void premiumFetch(sample)
        .then(() => {
          setVoiceMsg('');
          say(sample, { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true });
        })
        .catch((e: unknown) => setVoiceMsg(e instanceof PremiumError ? e.message : 'The premium voice could not be made. Try again.'));
      return;
    }
    if (st.voiceEngine === 'recorded') {
      void loadVoicePack(st.clipVoice).then((ok) => {
        if (!ok && !speechSupported()) setVoiceMsg('The recorded voice could not load. Check the connection once, then try again.');
        else say(sample, { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true });
      });
      return;
    }
    if (!speechSupported()) {
      setVoiceMsg('This browser cannot speak. Use the beep test, or try Safari (iPhone) or Chrome.');
      return;
    }
    say(sample, { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true });
    setTimeout(() => {
      const e = lastSpeechError();
      if (e) setVoiceMsg(`The browser reported: ${e}. Check the phone is not on silent and the volume is up.`);
      else setVoiceMsg('If you heard nothing: turn the volume up, switch the silent switch off, and pick another voice below.');
    }, 2500);
  };
  const testBeeps = () => {
    unlockAudio();
    testCues(st.volume);
    setVoiceMsg('You should hear: left ear, right ear, then both. Nothing? Check volume and the silent switch.');
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([lib.exportJson()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'navi-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setDataMsg('Saved to your downloads.');
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setDataMsg(lib.importJson(await f.text()) ? 'Backup restored.' : 'That file is not a Navi backup.');
  };

  const profile = PROFILES.find((p) => p.value === st.profile);
  const readout = READOUTS.find((r) => r.value === st.readout);

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Settings">
      <div className="space-y-6">
        <Section title="Sound">
          <Toggle label="Voice and beeps on" checked={!st.muted} onChange={(on) => set({ muted: !on })} />
          <Range label="Volume" value={st.volume} min={0.2} max={1} step={0.1} onChange={(volume) => set({ volume })} display={`${Math.round(st.volume * 100)}%`} />
          <Toggle label="Side beeps (left ear = left turn)" checked={st.cues} onChange={(cues) => set({ cues })} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={testVoice}><Volume2 size={18} /> Test voice</Button>
            <Button variant="raise" onClick={testBeeps}>Test beeps</Button>
          </div>
          {voiceMsg && <p role="status" className="text-sm text-sev3">{voiceMsg}</p>}
          <SoundReport voices={voices.length} tick={voiceMsg} />
          <Segmented<'premium' | 'recorded' | 'phone'> label="Voice type" value={st.voiceEngine} onChange={(voiceEngine) => set({ voiceEngine })} options={[{ value: 'premium', label: 'Premium' }, { value: 'recorded', label: 'Recorded' }, { value: 'phone', label: 'Phone' }]} />
          {st.voiceEngine === 'premium' && (
            <>
              <label className="block space-y-1">
                <span className="text-sm">Your OpenAI key</span>
                <input
                  type="password"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="sk-…"
                  value={st.premiumKey}
                  onChange={(e) => set({ premiumKey: e.target.value.trim() })}
                  className="min-h-12 w-full rounded-xl bg-bg px-3 text-[16px] ring-1 ring-line"
                />
              </label>
              <Segmented<PremiumVoice> label="Co-driver" value={st.premiumVoice} onChange={(premiumVoice) => set({ premiumVoice })} options={PREMIUM_VOICES.map((v) => ({ value: v.id, label: v.name }))} />
              <p className="text-sm text-mute">
                A premium voice that is told to sound like an urgent rally co-driver. Each road's calls are made once, on the planning screen, and kept on this phone, so the drive works with no signal. A road costs a few US cents on your own OpenAI account. The key stays on this phone and is sent only to OpenAI, over HTTPS. {PREMIUM_VOICES.find((v) => v.id === st.premiumVoice)?.blurb}.
                {st.premiumKey.trim().length > 0 && st.premiumKey.trim().length <= 20 ? ' That key looks too short.' : ''}
              </p>
              <Button variant="raise" className="w-full" onClick={() => { void clearPremiumAudio().then(() => setVoiceMsg('Saved premium audio cleared from this phone.')); }}>Clear saved premium audio</Button>
            </>
          )}
          {st.voiceEngine === 'recorded' && (
            <>
              <Segmented<ClipVoice> label="Co-driver" value={st.clipVoice} onChange={(clipVoice) => { set({ clipVoice }); unlockAudio(); void loadVoicePack(clipVoice).then(() => say(sample, { rate: st.speechRate, voiceURI: st.voiceURI, volume: st.volume, interrupt: true })); }} options={CLIP_VOICES.map((v) => ({ value: v.id, label: v.name }))} />
              <p className="text-sm text-mute">Recorded human-sounding voices, stored in the app, so they work with no signal. {CLIP_VOICES.find((v) => v.id === st.clipVoice)?.blurb}. Anything you type into a note that has no recording is read by the phone voice.{clipsFailed() ? ' The voice has not loaded yet; connect once and reopen Settings.' : ''}</p>
            </>
          )}
          {st.voiceEngine === 'phone' && speechSupported() && (
            <>
              <select aria-label="Voice" value={st.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })} className="min-h-12 w-full rounded-xl bg-bg px-3 text-[16px]">
                <option value="">Automatic{voices.length === 0 ? ' (no voices found)' : ''}</option>
                {voices.map((v) => (
                  <option key={v.uri} value={v.uri}>{v.name} ({v.lang})</option>
                ))}
              </select>
              <p className="text-sm text-mute">The free standard voice sounds robotic. On iPhone, open Settings, Accessibility, Spoken Content, Voices, English, and download an Enhanced or Premium voice (Ava, Zoe or Evan sound best). Come back here and pick it from the list; the best voices are listed first.</p>
              <Range label="Voice speed" value={st.speechRate} min={0.8} max={1.5} step={0.05} onChange={(speechRate) => set({ speechRate })} display={`${st.speechRate.toFixed(2)}×`} />
            </>
          )}
        </Section>

        <Section title="What the voice says">
          <Segmented<DialectId> label="Call style" value={st.dialect} onChange={(dialect) => set({ dialect })} options={DIALECTS.map((d) => ({ value: d.id, label: d.id === 'plain' ? 'Plain English' : d.id === 'rally' ? 'Co-driver' : 'Reversed' }))} />
          <p className="text-sm text-mute">{DIALECTS.find((d) => d.id === st.dialect)?.blurb}</p>
        </Section>

        <Section title="What the screen shows">
          <Segmented<Readout> label="Turn text" value={st.readout} onChange={(readout) => set({ readout })} options={READOUTS.map((r) => ({ value: r.value, label: r.label }))} />
          <p className="text-sm text-mute">{readout?.blurb}</p>
          <p className="text-sm text-mute">The spoken words always appear on screen too.</p>
          <div aria-label="Colour key" className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-bg p-3 text-sm">
            {KEY.map(([n, label]) => (
              <span key={n} className="flex items-center gap-2">
                <span aria-hidden className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: SEV_COLOR[n] }} />
                {label}
              </span>
            ))}
          </div>
          <p className="text-sm text-mute">Colour shows how sharp the turn is. The arrow and the word LEFT or RIGHT show which way.</p>
        </Section>

        <Section title="Look">
          <Segmented<Theme> label="Theme" value={st.theme} onChange={(theme) => set({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'auto', label: 'Match phone' }]} />
          <p className="text-sm text-mute">The drive screens and the map always stay dark so the route and the next turn stand out.</p>
        </Section>

        <Section title="Route">
          <Toggle label="Avoid motorways" checked={st.avoid.highways} onChange={(highways) => set({ avoid: { ...st.avoid, highways } })} />
          <Toggle label="Avoid tolls" checked={st.avoid.tolls} onChange={(tolls) => set({ avoid: { ...st.avoid, tolls } })} />
          <Toggle label="Avoid ferries" checked={st.avoid.ferries} onChange={(ferries) => set({ avoid: { ...st.avoid, ferries } })} />
          <Segmented<UnitSystem> label="Units" value={st.units} onChange={(units) => set({ units })} options={[{ value: 'metric', label: 'km · m' }, { value: 'imperial', label: 'mi · ft' }]} />
        </Section>

        <Section title="Vehicle">
          <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Vehicle on the map">
            {VEHICLES.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={st.vehicle === v.id}
                aria-label={v.label}
                onClick={() => set({ vehicle: v.id })}
                className={cn('flex flex-col items-center gap-1 rounded-2xl border px-1 py-2 text-[11px]', st.vehicle === v.id ? 'border-ink bg-panel text-ink' : 'border-line text-mute')}
              >
                <span className="h-[4.5rem] w-12 rounded-xl bg-[#aeb7c2] p-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: v.svg }} />
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-mute">This is what marks you on the map while you drive. It turns with your heading. Routes are planned the same for every vehicle.</p>
        </Section>

        <Section title="Driving">
          <Toggle label="Stage view" checked={st.stageView} onChange={(stageView) => set({ stageView })} />
          <p className="text-sm text-mute">Black screen like a rally computer: speed, heading, trip, total and distance left, the next call huge, the three after it listed, and a 5-4-3-2-1 count before you start. You can switch it on and off while driving.</p>
          <Segmented<DriverProfile> label="Driver profile" value={st.profile} onChange={(profile) => set({ profile, stageAttested: profile === 'stage' ? st.stageAttested : false })} options={PROFILES.map((p) => ({ value: p.value, label: p.label }))} />
          <p className="text-sm text-mute">{profile?.blurb}</p>
          {st.profile === 'stage' && !st.stageAttested && (
            <Button variant="raise" className="w-full" onClick={() => set({ stageAttested: true })}>
              I am on a closed course
            </Button>
          )}
          {st.profile === 'stage' && st.stageAttested && <p className="text-sm text-go">Stage timing is on for this device. Switching profile turns it off.</p>}
          <Range label="Warning time" value={st.leadSec} min={4} max={12} step={1} onChange={(leadSec) => set({ leadSec })} display={`${st.leadSec} s`} />
        </Section>

        <Section title="Traffic">
          <Toggle label="Show traffic on the map" checked={st.traffic} onChange={(traffic) => set({ traffic })} />
          <p className="text-sm text-mute">Translucent arrows on both sides of the road in the turn colours: green clear, yellow slow, orange heavy, red stopped. The right side is your direction and the left side is oncoming. Off by default. Never shown in stage view.</p>
          {st.traffic && (
            <>
              <Segmented<'sample' | 'tomtom' | 'here'> label="Data" value={st.trafficSource} onChange={(trafficSource) => set({ trafficSource })} options={[{ value: 'sample', label: 'Sample' }, { value: 'tomtom', label: 'TomTom' }, { value: 'here', label: 'HERE' }]} />
              {st.trafficSource === 'sample' ? (
                <p className="text-sm text-mute">Sample traffic is made up. It is only for looking at the design. Pick TomTom or HERE and add your own free key for real traffic.</p>
              ) : (
                <>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Traffic key"
                    placeholder="Paste your free key"
                    value={st.trafficKey}
                    onChange={(e) => set({ trafficKey: e.target.value })}
                    className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-ink"
                  />
                  <p className="text-sm text-mute">The key stays on this device and is only sent to {st.trafficSource === 'tomtom' ? 'TomTom' : 'HERE'}. This source gives one direction, so the oncoming side repeats it.</p>
                </>
              )}
              {trafficError && <p role="status" className="text-sm text-sev2">Traffic: {trafficError}.</p>}
            </>
          )}
        </Section>

        <Section title="Your data">
          <p className="text-sm text-mute">Saved places, history and settings stay on this device. Nothing is uploaded.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="raise" onClick={download}><Download size={18} /> Back up</Button>
            <Button variant="raise" onClick={() => file.current?.click()}><Upload size={18} /> Restore</Button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <Button variant="quiet" className="w-full" onClick={() => { lib.wipe(); setDataMsg('Saved places and history cleared.'); }}>Clear saved places and history</Button>
          {dataMsg && <p role="status" className="text-sm text-mute">{dataMsg}</p>}
        </Section>
      </div>
    </Sheet>
  );
}
