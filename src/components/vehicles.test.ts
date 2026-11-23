import { describe, expect, it } from 'vitest';
import { VEHICLES } from './vehicles';

describe('vehicle markers', () => {
  it('offers the dot plus four vehicles with drawable svg', () => {
    expect(VEHICLES.map((v) => v.id)).toEqual(['dot', 'car', 'bike', 'utv', 'truck']);
    for (const v of VEHICLES) {
      expect(v.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(v.svg.endsWith('</svg>')).toBe(true);
    }
  });
});
