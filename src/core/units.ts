import type { UnitSystem } from './types';

const M_PER_MI = 1609.344;

export function formatDistance(m: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const ft = m * 3.28084;
    if (m >= 400) return `${(m / M_PER_MI).toFixed(m >= 16093 ? 0 : 1)} mi`;
    return `${Math.round(ft / 10) * 10} ft`;
  }
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}

export function formatSpeed(kmhVal: number, units: UnitSystem): string {
  return units === 'imperial' ? `${Math.round(kmhVal * 0.621371)}` : `${Math.round(kmhVal)}`;
}

export const speedUnit = (units: UnitSystem) => (units === 'imperial' ? 'mph' : 'km/h');

export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Rally trip-meter reading: always two decimals in km (or miles), like a Terratrip or Brantz. */
export function formatTrip(m: number, units: UnitSystem): string {
  const v = Math.max(0, m) / (units === 'imperial' ? M_PER_MI : 1000);
  return v.toFixed(2);
}

export const tripUnit = (units: UnitSystem) => (units === 'imperial' ? 'mi' : 'km');

const WINDS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Compass heading as degrees (0 to 359) and a 16-point label. */
export function headingLabel(bearing: number): { deg: number; wind: string } {
  const deg = ((Math.round(bearing) % 360) + 360) % 360;
  return { deg, wind: WINDS[Math.round(deg / 22.5) % 16] };
}
