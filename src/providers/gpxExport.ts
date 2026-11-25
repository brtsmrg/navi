import { noteText, RouteTracker, type PhraseOptions, type Stage } from '@/core';

const esc = (t: string) => t.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c);

/**
 * The route as a GPX file: the track, and one waypoint per pacenote with the words Navi says there.
 * Nothing is sent anywhere; the file is made on the phone. A GPX opened in Navi again gives the same road.
 */
export function stageToGpx(stage: Stage, opts: PhraseOptions, title?: string): string {
  const name = esc((title ?? stage.route.name ?? 'Navi route').slice(0, 80));
  const tracker = new RouteTracker(stage.route.coords);
  const wpts = stage.notes
    .filter((n) => n.kind !== 'finish')
    .map((n) => {
      const [lng, lat] = tracker.pointAt(n.s).lngLat;
      const km = (n.s / 1000).toFixed(2);
      return `  <wpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"><name>${esc(noteText(n, opts))}</name><desc>${km} km</desc></wpt>`;
    });
  const pts = stage.route.coords.map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Navi Rally" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${name}</name></metadata>`,
    ...wpts,
    `  <trk>`,
    `    <name>${name}</name>`,
    `    <trkseg>`,
    ...pts,
    `    </trkseg>`,
    `  </trk>`,
    '</gpx>',
    '',
  ].join('\n');
}

/** Hand the file to the browser as a download. */
export function downloadText(fileName: string, text: string, mime = 'application/gpx+xml'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const safeFileName = (t: string) => `${t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'navi-route'}.gpx`;
