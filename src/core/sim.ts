import type { Path } from './path';
import { cornerSpeedMps, PROFILE_G } from './severity';
import type { DriverProfile } from './types';

export interface DriveOptions {
  /** target cruise speed on straights (m/s) */
  cruiseMps: number;
  profile: DriverProfile;
  accelMps2: number;
  brakeMps2: number;
}

export const DEFAULT_DRIVE: DriveOptions = {
  cruiseMps: 22,
  profile: 'road',
  accelMps2: 2.5,
  brakeMps2: 4,
};

/**
 * Speed (m/s) at every path sample for a driver who cruises at a target speed,
 * slows for corners to the comfortable cornering speed, and brakes/accelerates
 * at fixed rates. Used for the demo ride and for deterministic tests.
 */
export function speedProfile(path: Path, opts: Partial<DriveOptions> = {}): Float64Array {
  const o = { ...DEFAULT_DRIVE, ...opts };
  const g = PROFILE_G[o.profile];
  const { n, ds, kappa } = path;
  const cap = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.max(Math.abs(kappa[i]), Math.abs(path.kappaFine[i]));
    cap[i] = Math.min(o.cruiseMps, k > 1 / 600 ? cornerSpeedMps(1 / k, g) : o.cruiseMps);
    cap[i] = Math.max(cap[i], 4);
  }
  const v = Float64Array.from(cap);
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * o.brakeMps2 * ds));
  v[0] = Math.min(v[0], 6);
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * o.accelMps2 * ds));
  return v;
}

export interface DriveSample {
  tMs: number;
  s: number;
  v: number;
}

/** Integrate position over time at fixed dt. */
export function drive(path: Path, v: Float64Array, dtMs = 500): DriveSample[] {
  const out: DriveSample[] = [];
  let s = 0;
  let t = 0;
  while (s < path.length) {
    const i = Math.min(path.n - 1, Math.floor(s / path.ds));
    const speed = v[i];
    out.push({ tMs: t, s, v: speed });
    s += speed * (dtMs / 1000);
    t += dtMs;
  }
  out.push({ tMs: t, s: path.length, v: v[path.n - 1] });
  return out;
}
