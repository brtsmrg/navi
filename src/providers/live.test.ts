import { describe, expect, it } from 'vitest';
import { generateStage } from '@/core';
import { planWaypoints } from '@/lib/plan';

/**
 * Live check against real services and a real road. Skipped unless LIVE=1 (it needs internet).
 * Run: LIVE=1 npm run test:live
 * Stelvio Pass, Prad side (Prato allo Stelvio to the summit) is famous for 48 numbered hairpins.
 * The thresholds are hypotheses to be confirmed (or corrected) by the first real run.
 */
const live = process.env.LIVE === '1' ? describe : describe.skip;

live('live road: Stelvio Pass from Prad', () => {
  it('finds a hairpin-dense stage with plausible notes', async () => {
    const stage = await planWaypoints([[10.5963, 46.6194], [10.4538, 46.5287]]);
    const { stats } = stage;
    console.log(JSON.stringify({ km: (stats.distanceM / 1000).toFixed(1), corners: stats.cornerCount, hairpins: stats.hairpins, twist: Math.round(stats.twistScore), notes: stats.noteCount }));
    expect(stats.distanceM).toBeGreaterThan(15_000);
    expect(stats.hairpins).toBeGreaterThanOrEqual(30);
    expect(stats.twistScore).toBeGreaterThan(60);
    expect(generateStage(stage.route).notes.length).toBe(stage.notes.length > 0 ? stage.notes.length : -1);
  }, 60_000);
});
