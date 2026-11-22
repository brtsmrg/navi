import type { DriverProfile, Severity } from './types';

export const G = 9.80665;

/**
 * Upper radius bound (m) for severities 1..5; anything wider is 6.
 * Derived from corner speed v = sqrt(a*r) at a reference 0.45 g, with bin
 * edges at 40 / 60 / 80 / 105 / 135 km/h:
 *   r = v^2 / (0.45 g)  ->  28, 63, 112, 193, 319 m.
 * 1 = tightest, 6 = flat out (the "McRae in Gear" convention).
 */
export const SEVERITY_EDGES_M = [28, 63, 112, 193, 319] as const;

export function severityFromRadius(radiusM: number): Severity {
  for (let i = 0; i < SEVERITY_EDGES_M.length; i++) {
    if (radiusM < SEVERITY_EDGES_M[i]) return (i + 1) as Severity;
  }
  return 6;
}

/** Comfortable cornering speed (m/s) for a radius at a lateral acceleration (in g). */
export function cornerSpeedMps(radiusM: number, lateralG: number): number {
  return Math.sqrt(lateralG * G * radiusM);
}

/** Lateral acceleration (g) used for speed warnings. Stage is for closed courses only. */
export const PROFILE_G: Record<DriverProfile, number> = {
  cruise: 0.3,
  road: 0.4,
  stage: 0.6,
};

/** Upper speed (km/h) of each severity bin at the 0.45 g reference, for UI hints. */
export const SEVERITY_SPEED_KMH: Record<Severity, string> = {
  1: 'up to 40',
  2: '40-60',
  3: '60-80',
  4: '80-105',
  5: '105-135',
  6: '135+',
};

export const kmh = (mps: number) => mps * 3.6;
export const mps = (kmhVal: number) => kmhVal / 3.6;
