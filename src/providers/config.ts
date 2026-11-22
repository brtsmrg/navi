/**
 * Endpoints. All HTTPS. Defaults are public community services meant for
 * light use (see docs/DATA-AND-TERMS.md); point these at your own hosts
 * before real traffic.
 */
export const CONFIG = {
  valhalla: import.meta.env.VITE_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de',
  photon: import.meta.env.VITE_PHOTON_URL ?? 'https://photon.komoot.io',
  mapStyle: import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron',
} as const;
