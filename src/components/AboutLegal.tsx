import { useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { eraseEverything } from '@/lib/eraseAll';
import { LEGAL, LICENSES_URL, PRIVACY_URL, TERMS_URL } from '@/lib/legal';
import { Button, Sheet } from './ui';

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-xl font-semibold text-ink">{children}</h3>;
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-text underline">
      {children} <ExternalLink size={14} aria-hidden />
    </a>
  );
}

/** Everything a driver, a store reviewer or a lawyer needs to see in one place. */
export function AboutLegal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) setConfirm(false); onOpenChange(o); }} title="About and legal">
      <div className="space-y-5 text-[15px] leading-relaxed text-mute">
        <section className="space-y-1">
          <H>Navi</H>
          <p>A co-driver for any road. It reads the road ahead from map data and calls what is coming. Build {__BUILD__}.</p>
          <p>Run by {LEGAL.owner}. Questions, problems or privacy requests: {LEGAL.contact}.</p>
        </section>

        <section className="space-y-1">
          <H>Drive safely</H>
          <p>
            You are the driver. Maps can be wrong, and Navi cannot see traffic, road surface, weather or people. Obey the law and the
            posted limits. Set up the route before you move. Fast driving belongs on closed courses only.
          </p>
        </section>

        <section className="space-y-1">
          <H>Your privacy</H>
          <p>Navi has no account, no ads and no tracking. Your places, history and settings stay on this phone. Navi has no server of its own.</p>
          <p>To do its job, Navi asks open map services, and each one sees your internet address:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Map pictures (OpenFreeMap): the area on screen.</li>
            <li>Search and Near me (Photon): your words and your position.</li>
            <li>Routes (Valhalla): the start, stops and end of a route.</li>
            <li>Road shapes (Overpass): the box around the area you drive in or save.</li>
          </ul>
          <p>
            Optional extras send data only when you turn them on with your own key or address: the OpenAI voice, traffic from TomTom or
            HERE, and a voice from your own PC. The free voice is downloaded once from Hugging Face.
          </p>
          <div className="flex flex-wrap gap-x-5">
            <Link href={PRIVACY_URL}>Privacy policy</Link>
            <Link href={TERMS_URL}>Terms of use</Link>
          </div>
        </section>

        <section className="space-y-1">
          <H>Voices are AI-made</H>
          <p>The spoken calls, apart from your phone's own voice, are made by AI text-to-speech models. They are not recordings of a person.</p>
        </section>

        <section className="space-y-1">
          <H>Credits</H>
          <p>
            Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL).{' '}
            <a className="font-medium text-brand-text underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              openstreetmap.org/copyright
            </a>
          </p>
          <p>
            Map pictures by OpenFreeMap. Routing by Valhalla. Search by Photon. Free voice: Kokoro-82M and ONNX Runtime (Apache 2.0 and
            MIT). Logo letters: Barlow Condensed (SIL Open Font License).
          </p>
          <Link href={LICENSES_URL}>Open-source licences</Link>
        </section>

        <section className="space-y-2">
          <H>Erase everything</H>
          <p>Removes your settings, saved places, history, saved roads, saved voice audio and best score from this phone, then restarts Navi. It cannot be undone. Back up first in Settings if you want to keep anything.</p>
          {!confirm ? (
            <Button variant="raise" className="w-full" onClick={() => setConfirm(true)}>
              <Trash2 size={18} /> Erase everything on this phone
            </Button>
          ) : (
            <div role="alert" className="space-y-2 rounded-xl bg-bg p-3">
              <p className="text-ink">Erase all of Navi's data on this phone?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="raise" onClick={() => setConfirm(false)} disabled={busy}>Keep my data</Button>
                <Button variant="primary" disabled={busy} onClick={() => { setBusy(true); void eraseEverything(); }}>
                  {busy ? 'Erasing…' : 'Yes, erase it'}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
