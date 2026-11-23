import { describe, expect, it } from 'vitest';
import { formatTrip, headingLabel, tripUnit } from './units';

describe('rally computer readouts', () => {
  it('formats trip in km with two decimals', () => {
    expect(formatTrip(432, 'metric')).toBe('0.43');
    expect(formatTrip(12345.6, 'metric')).toBe('12.35');
    expect(formatTrip(-5, 'metric')).toBe('0.00');
  });
  it('formats trip in miles', () => {
    expect(formatTrip(1609.344, 'imperial')).toBe('1.00');
    expect(tripUnit('imperial')).toBe('mi');
  });
  it('gives a heading and a 16-point wind', () => {
    expect(headingLabel(0)).toEqual({ deg: 0, wind: 'N' });
    expect(headingLabel(359.6)).toEqual({ deg: 0, wind: 'N' });
    expect(headingLabel(92)).toEqual({ deg: 92, wind: 'E' });
    expect(headingLabel(-90)).toEqual({ deg: 270, wind: 'W' });
    expect(headingLabel(200)).toEqual({ deg: 200, wind: 'SSW' });
  });
});
