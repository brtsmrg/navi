import { useEffect, useState } from 'react';
import { DIALECTS, type DialectId, type DriverProfile, type UnitSystem } from '@/core';
import { useApp } from '@/lib/store';
import { listVoices, say, speechSupported, type VoiceInfo } from '@/lib/speech';
import { Button, Range, Segmented, Sheet, Toggle } from './ui';

const PROFILES: { value: DriverProfile; label: string; blurb: string }[] = [
  { value: 'cruise', label: 'Relaxed', blurb: 'Earlier calls, gentle corner speeds.' },
  { value: 'road', label: 'Road', blurb: 'The default for public roads.' },
  { value: 'stage', label: 'Stage', blurb: 'Closed courses only. Later calls, higher corner speeds.' },
];

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const setOpen = useApp((s) => s.setSettingsOpen);
  const st = useApp((s) => s.settings);
  const set = useApp((s) => s.set);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);

  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const profile = PROFILES.find((p) => p.value === st.profile);
  const test = () => say(st.dialect === 'plain' ? 'Sharp left, then in 100 metres, easy right.' : 'Left 4 long, 100, right 3.', { rate: st.speechRate, voiceURI: st.voiceURI, interrupt: true });

  return (
    <Sheet open={open} onOpenChange={setOpen} title="Settings">
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm text-mute">Call style</h3>
          <Segmented<DialectId> label="Call style" value={st.dialect} onChange={(dialect) => set({ dialect })} options={DIALECTS.map((d) => ({ value: d.id, label: d.name.replace('Co-driver (reversed)', 'Reversed') }))} />
          <p className="text-sm text-mute">{DIALECTS.find((d) => d.id === st.dialect)?.blurb}</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm text-mute">Driver profile</h3>
          <Segmented<DriverProfile> label="Driver profile" value={st.profile} onChange={(profile) => set({ profile, stageAttested: profile === 'stage' ? st.stageAttested : false })} options={PROFILES.map((p) => ({ value: p.value, label: p.label }))} />
          <p className="text-sm text-mute">{profile?.blurb}</p>
          {st.profile === 'stage' && !st.stageAttested && (
            <Button variant="raise" className="w-full" onClick={() => set({ stageAttested: true })}>
              I am on a closed course
            </Button>
          )}
          {st.profile === 'stage' && st.stageAttested && <p className="text-sm text-go">Stage timing is on for this device. Switching profile turns it off.</p>}
        </section>

        <section>
          <Range label="Warning time" value={st.leadSec} min={4} max={12} step={1} onChange={(leadSec) => set({ leadSec })} display={`${st.leadSec} s`} />
          <Range label="Voice speed" value={st.speechRate} min={0.8} max={1.5} step={0.05} onChange={(speechRate) => set({ speechRate })} display={`${st.speechRate.toFixed(2)}×`} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm text-mute">Units</h3>
          <Segmented<UnitSystem> label="Units" value={st.units} onChange={(units) => set({ units })} options={[{ value: 'metric', label: 'km · m' }, { value: 'imperial', label: 'mi · ft' }]} />
        </section>

        {speechSupported() && (
          <section className="space-y-2">
            <h3 className="text-sm text-mute">Voice</h3>
            <select aria-label="Voice" value={st.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })} className="min-h-12 w-full rounded-xl bg-bg px-3 text-[16px]">
              <option value="">Automatic</option>
              {voices.map((v) => (
                <option key={v.uri} value={v.uri}>{v.name} ({v.lang})</option>
              ))}
            </select>
            <Button variant="raise" className="w-full" onClick={test}>Play a test call</Button>
          </section>
        )}

        <Toggle label="Mute voice (keep the screen)" checked={st.muted} onChange={(muted) => set({ muted })} />
      </div>
    </Sheet>
  );
}
