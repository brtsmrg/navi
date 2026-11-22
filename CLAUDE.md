# Navi: rally co-driver for any road

Installable web app (React 19, Vite, TypeScript, Tailwind v4, MapLibre) that turns a route into rally-style
pacenotes ("Left 4 long, 100, right 3") and calls them aloud before each corner, timed to the driver's speed.

## Commands
- `npm run verify`  typecheck, lint, tests, production build. Run before every commit.
- `npm run dev`     local dev server. `npm run e2e` screenshots the built app on emulated iPhone 15 and Pixel 7.
- `npm run cap:android` / `npm run cap:ios`  generate and sync the native projects (see docs/MOBILE.md).
- `npm run xtool:sync`  copy the build into the xtool iPhone shell.

## Layout
- `src/core`       pacenote engine. Pure TypeScript, no DOM, no network. Everything here is covered by tests.
- `src/providers`  routing (Valhalla), search (Photon), GPX, share links. All network access lives here.
- `src/ride`       imperative ride controller (GPS or demo loop, scheduler, speech, wake lock).
- `src/components` UI. `src/lib` store, map style, speech, helpers.
- `docs/`          spec, data terms, security, mobile, growth, roadmap.

## Rules for changes
1. Engine changes need a test with a known answer (arcs of known radius, simulated drives). Do not tune by eye.
2. Severity scale: 1 = tightest, 6 = flat. Bins come from corner speed at 0.45 g (docs/PACENOTE-SPEC.md).
3. Do not add Google Maps Platform APIs without reading docs/DATA-AND-TERMS.md. Google route results may only
   be shown on a Google map, so the default stack is open (MapLibre, OpenFreeMap, Valhalla, Photon).
4. No secrets in the repo or the bundle. No analytics or trackers without an explicit decision.
5. Safety copy (SafetyGate, Stage profile attestation) must not be weakened. Stage timing is for closed courses.
6. Mobile: keep touch targets at least 44 px, use `safe-t` / `safe-b`, keep `viewport-fit=cover`, and start speech
   only from a tap (`primeSpeech`) so iOS allows it.
7. Acquisition-ready by default (docs/ACQUISITION-READINESS.md): permissive dependency licences only, no scraped or third-party-restricted data, no tracking without consent, nothing that clouds ownership of the code.
8. Done means verified: run `npm run verify` and report what was and was not checked.
