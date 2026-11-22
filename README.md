# Navi

A rally co-driver for any road. Pick a route and Navi reads the bends ahead and calls them before you reach them, timed to your speed: "Left 4 long, 100, right 3." One look at the screen shows each corner as a sketch of the real road.

Built for drivers who want to see further ahead. It is an aid, not a licence to go faster. Stage timing is for closed courses only.

## Try it
```bash
npm ci
npm run dev
```
Open the URL, tap **Try a demo stage**, then **Watch a demo drive**. Voice starts after your first tap (iOS requires it).

## What it does
- Search a place, drop a pin (long-press the map), or tap **Near me** (fuel, charging, food, coffee, parking).
- Save Home, Work and Favourites; Recent trips keep a history; pin a trip to keep it under Saved. All stored on the device only, with JSON backup and restore.
- Route options: avoid motorways, tolls or ferries; up to three stops; arrival time.
- Turns are shown as big arrows with plain words ("Sharp left") and spoken in plain English or rally shorthand. Optional stereo beeps (left ear = left turn) in Settings.

## On your phone
See [docs/MOBILE.md](docs/MOBILE.md): web app (iPhone and Android), Android test APK, unsigned iPhone IPA for SideStore/AltStore/Sideloadly, and the xtool shell for building on Windows.

## Check it
```bash
npm run verify   # typecheck, lint, tests, build
npm run e2e      # screenshots on emulated iPhone 15 and Pixel 7
```

## Docs
[Pacenote spec](docs/PACENOTE-SPEC.md) · [Data and terms](docs/DATA-AND-TERMS.md) · [Security](docs/SECURITY.md) · [Growth and revenue](docs/GROWTH-AND-REVENUE.md) · [Roadmap](docs/ROADMAP.md)

Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap. License: not yet chosen (all rights reserved until then).

## Brand
Logo concepts live in `brand/` (regenerate with `python3 brand/make-logos.py`). Black and red, tail lights, no real car model. The chosen logo replaces the placeholder icon in `public/` via `npm run icons`.
