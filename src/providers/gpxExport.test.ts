import { describe, expect, it } from 'vitest';
import { generateStage } from '@/core';
import { openTestStage } from '@/core/synth';
import { parseGpx } from './gpx';
import { safeFileName, stageToGpx } from './gpxExport';

describe('GPX export', () => {
  const stage = generateStage(openTestStage());
  const xml = stageToGpx(stage, { dialect: 'plain', units: 'metric' }, 'Test <road> & "co"');

  it('writes the track and a waypoint for each pacenote', () => {
    expect(xml.startsWith('<?xml')).toBe(true);
    expect((xml.match(/<wpt /g) ?? []).length).toBe(stage.notes.filter((n) => n.kind !== 'finish').length);
    expect((xml.match(/<trkpt /g) ?? []).length).toBe(stage.route.coords.length);
    expect(xml).toContain('Test &lt;road&gt; &amp; &quot;co&quot;');
    expect(xml).not.toContain('<road>');
  });

  it('opens again in Navi as the same road', () => {
    const back = parseGpx(xml);
    expect(back.coords.length).toBe(stage.route.coords.length);
    expect(Math.abs(back.coords[5][0] - stage.route.coords[5][0])).toBeLessThan(1e-6);
    expect(back.name).toContain('Test');
  });

  it('makes a safe file name', () => {
    expect(safeFileName('Tail of the Dragon / US-129?')).toBe('Tail-of-the-Dragon-US-129.gpx');
    expect(safeFileName('///')).toBe('navi-route.gpx');
  });
});
