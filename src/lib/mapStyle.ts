/* eslint-disable @typescript-eslint/no-explicit-any */
type Style = Record<string, any>;

export const BLANK_STYLE: Style = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0e1115' } }],
};

const C = {
  land: '#0e1115',
  water: '#080a0d',
  green: '#11171a',
  building: '#151a20',
  roadMinor: '#252c35',
  roadMajor: '#37404b',
  casing: '#0b0d10',
  rail: '#1b2026',
  boundary: '#2a313a',
  text: '#98a2b0',
  halo: '#0b0d10',
};

/**
 * Re-colour a light OpenMapTiles-schema style (OpenFreeMap "positron") for the
 * night cockpit. Works by layer id and type, not by parsing the original
 * colours, so it survives upstream palette changes. Geometry, sources, glyphs
 * and attribution are left untouched.
 */
export function darkenStyle(src: Style): Style {
  const style: Style = structuredClone(src);
  for (const layer of style.layers ?? []) {
    const id = String(layer.id).toLowerCase();
    const paint: Style = (layer.paint = layer.paint ?? {});
    switch (layer.type) {
      case 'background':
        paint['background-color'] = C.land;
        break;
      case 'fill': {
        let c = C.land;
        if (/water/.test(id)) c = C.water;
        else if (/park|wood|grass|forest|landcover|landuse|nature|garden|golf|cemetery/.test(id)) c = C.green;
        else if (/building/.test(id)) c = C.building;
        paint['fill-color'] = c;
        delete paint['fill-outline-color'];
        delete paint['fill-pattern'];
        break;
      }
      case 'line': {
        let c = C.roadMinor;
        if (/boundary|admin/.test(id)) c = C.boundary;
        else if (/water/.test(id)) c = C.water;
        else if (/rail|transit|aeroway/.test(id)) c = C.rail;
        else if (/casing|outline/.test(id)) c = C.casing;
        else if (/motorway|trunk|primary|highway/.test(id)) c = C.roadMajor;
        paint['line-color'] = c;
        break;
      }
      case 'symbol':
        paint['text-color'] = C.text;
        paint['text-halo-color'] = C.halo;
        paint['icon-opacity'] = 0.35;
        break;
      case 'fill-extrusion':
        paint['fill-extrusion-color'] = C.building;
        break;
      default:
        break;
    }
  }
  return style;
}

export async function loadStyle(url: string, signal?: AbortSignal): Promise<Style> {
  try {
    const res = await fetch(url, { signal, credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    return darkenStyle((await res.json()) as Style);
  } catch {
    return BLANK_STYLE;
  }
}
