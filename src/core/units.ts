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
