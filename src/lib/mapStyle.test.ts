import { describe, expect, it } from 'vitest';
import { darkenStyle } from './mapStyle';

describe('darkenStyle', () => {
  const src = {
    version: 8,
    glyphs: 'https://example.test/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://example.test/planet' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': 'rgb(242,243,240)' } },
      { id: 'water', type: 'fill', source: 'omt', paint: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 0, '#aaa', 10, '#bbb'] } },
      { id: 'road_motorway', type: 'line', source: 'omt', paint: { 'line-color': '#fff', 'line-width': 3 } },
      { id: 'road_minor_casing', type: 'line', source: 'omt', paint: { 'line-color': '#ccc' } },
      { id: 'place_label', type: 'symbol', source: 'omt', layout: { 'text-field': '{name}' }, paint: { 'text-color': '#333' } },
    ],
  };
  it('recolours by layer role and keeps geometry, sources and glyphs', () => {
    const out = darkenStyle(src);
    expect(out.glyphs).toBe(src.glyphs);
    expect(out.sources).toEqual(src.sources);
    const byId = Object.fromEntries(out.layers.map((l: { id: string }) => [l.id, l]));
    expect(byId.background.paint['background-color']).toBe('#0e1115');
    expect(byId.water.paint['fill-color']).toBe('#080a0d');
    expect(byId.road_motorway.paint['line-color']).toBe('#37404b');
    expect(byId.road_motorway.paint['line-width']).toBe(3);
    expect(byId.road_minor_casing.paint['line-color']).toBe('#0b0d10');
    expect(byId.place_label.layout['text-field']).toBe('{name}');
    expect(byId.place_label.paint['text-color']).toBe('#98a2b0');
  });
  it('does not mutate the input', () => {
    darkenStyle(src);
    expect(src.layers[0].paint['background-color']).toBe('rgb(242,243,240)');
  });
});
