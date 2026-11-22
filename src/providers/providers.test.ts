import { describe, expect, it } from 'vitest';
import { parseGpx } from './gpx';
import { mapFeatures } from './photon';
import { decodePolyline, encodePolyline } from './polyline';
import { buildShareUrl, parseShareHash } from './share';
import { mapEdges, parseRoute } from './valhalla';

describe('polyline', () => {
  it('matches the published Google example (precision 5)', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(pts).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    expect(encodePolyline(pts, 5)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
  it('round-trips at precision 6', () => {
    const pts: [number, number][] = [[-75.69719, 45.42153], [-75.69, 45.43], [-75.1, 45.9]];
    const back = decodePolyline(encodePolyline(pts, 6), 6);
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i][0], 6);
      expect(p[1]).toBeCloseTo(pts[i][1], 6);
    });
  });
  it('rejects a truncated string', () => {
    expect(() => decodePolyline('_p~iF~ps|', 5)).toThrow();
  });
});

describe('valhalla mapping (hand-built fixture from the API reference)', () => {
  const leg1 = encodePolyline([[-75.7, 45.4], [-75.69, 45.4], [-75.69, 45.41]], 6);
  const leg2 = encodePolyline([[-75.69, 45.41], [-75.68, 45.41], [-75.67, 45.42]], 6);
  const raw = {
    trip: {
      summary: { length: 2.5, time: 300 },
      legs: [
        { shape: leg1, maneuvers: [{ type: 1, begin_shape_index: 0 }, { type: 15, begin_shape_index: 1, street_names: ['Main St'] }, { type: 4, begin_shape_index: 2 }] },
        { shape: leg2, maneuvers: [
          { type: 26, begin_shape_index: 1, roundabout_exit_count: 2 },
          { type: 27, begin_shape_index: 2 },
        ] },
      ],
    },
  };
  it('joins legs without a duplicate vertex and offsets maneuver indexes', () => {
    const r = parseRoute(raw);
    expect(r.coords).toHaveLength(5);
    expect(r.distance).toBe(2500);
    expect(r.maneuvers).toEqual([
      { shapeIndex: 1, kind: 'turn', side: 'L', sharpness: 'normal', street: 'Main St' },
      { shapeIndex: 3, endShapeIndex: 4, kind: 'roundabout', exitCount: 2 },
    ]);
  });
  it('throws on an empty response', () => {
    expect(() => parseRoute({})).toThrow('No route found');
  });
  it('maps edges to distances and drops bogus speed limits', () => {
    const coords = parseRoute(raw).coords;
    const e = mapEdges([{ begin_shape_index: 0, end_shape_index: 2, speed_limit: 80 }, { begin_shape_index: 2, end_shape_index: 4, speed_limit: 0 }], coords);
    expect(e[0].speedLimit).toBe(80);
    expect(e[1].speedLimit).toBeUndefined();
    expect(e[1].fromS).toBeCloseTo(e[0].toS, 3);
  });
});

describe('photon mapping', () => {
  it('builds titles and subtitles', () => {
    const [p] = mapFeatures([
      { geometry: { coordinates: [-75.7, 45.4] }, properties: { name: 'Gatineau Park', city: 'Chelsea', state: 'Quebec', country: 'Canada', osm_type: 'R', osm_id: 5 } },
    ]);
    expect(p.title).toBe('Gatineau Park');
    expect(p.subtitle).toBe('Chelsea, Quebec, Canada');
    expect(p.lngLat).toEqual([-75.7, 45.4]);
  });
});

describe('gpx', () => {
  it('reads track points whatever the attribute order', () => {
    const r = parseGpx(`<gpx><trk><name>Test road</name><trkseg>
      <trkpt lat="45.1" lon="-75.1"><ele>1</ele></trkpt>
      <trkpt lon="-75.2" lat="45.2"/>
    </trkseg></trk></gpx>`);
    expect(r.coords).toEqual([[-75.1, 45.1], [-75.2, 45.2]]);
    expect(r.name).toBe('Test road');
  });
  it('falls back to route points and rejects junk', () => {
    expect(parseGpx('<rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2.1"/></rte>').coords).toHaveLength(2);
    expect(() => parseGpx('<gpx></gpx>')).toThrow();
    expect(() => parseGpx('<trkpt lat="999" lon="2"/><trkpt lat="1" lon="2"/>')).toThrow();
  });
});

describe('share links', () => {
  it('round-trips waypoints and rejects tampered input', () => {
    const w: [number, number][] = [[-75.7, 45.4], [-75.5, 45.6]];
    const url = buildShareUrl('https://example.com', { waypoints: w, dialect: 'plain' });
    const hash = new URL(url).hash;
    const back = parseShareHash(hash);
    expect(back?.dialect).toBe('plain');
    expect(back!.waypoints[1][0]).toBeCloseTo(-75.5, 5);
    expect(parseShareHash('#r=' + 'a'.repeat(3000))).toBeNull();
    expect(parseShareHash('#r=')).toBeNull();
    expect(parseShareHash('#nonsense')).toBeNull();
  });
});
