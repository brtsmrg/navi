# Data sources and terms

Navi uses open services by default. Read this before adding or swapping a data source.

| Need | Default | Terms to respect |
|------|---------|------------------|
| Map tiles and style | OpenFreeMap (OpenMapTiles schema) | Free, no key. Keep OpenStreetMap attribution (ODbL). |
| Routing | Valhalla public instance (`valhalla1.openstreetmap.de`) | Community demo, about 1 request per second. Self-host before real traffic. |
| Place search | Photon (`photon.komoot.io`) | Fair use. Self-host before real traffic. |
| Road attributes | Valhalla `trace_attributes` (speed limit, surface), fails soft | Same instance as routing. |
Override with `VITE_VALHALLA_URL`, `VITE_PHOTON_URL`, `VITE_MAP_STYLE_URL`. If you change hosts, update the CSP in `public/_headers`.

## Why not Google Maps by default
The Google Maps Platform terms allow Routes and Directions results to be used only together with a Google map, and permit caching only of latitude/longitude values (for up to 30 days). Real-time navigation use is allowed subject to Google's safety requirements. Navi draws its own MapLibre map, so using Google route data here would breach those terms. A Google-map build is possible later as a separate front end; it would need its own review.
Check the current terms before relying on this summary: https://cloud.google.com/maps-platform/terms
