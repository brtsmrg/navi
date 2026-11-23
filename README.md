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
- Turn colour shows sharpness (red = hairpin, green = easy); the arrow and the word LEFT or RIGHT show direction.
- Edit any pacenote (tighter, easier, left or right, your own words, or skip it). Edits are saved on the phone per route and travel with a share link.
- While driving: Repeat, Tighter, Easier, Sooner and Later buttons correct the last call. **Stage view** is a big black screen with the next call and the three after it, plus a 5-4-3-2-1 start count.
- Share a route as a link (place names and your pacenote edits included). No account, nothing stored on a server.
- Dark, light or match-phone look for the planning screens; the drive screens and map stay dark.
- Turns are shown as big arrows with plain words ("Sharp left") and spoken in plain English or rally shorthand. Optional stereo beeps (left ear = left turn) in Settings.

## On your phone
See [docs/MOBILE.md](docs/MOBILE.md): web app (iPhone and Android), Android test APK, unsigned iPhone IPA for SideStore/AltStore/Sideloadly, and the xtool shell for building on Windows.

## Check it
```bash
npm run verify   # typecheck, lint, tests, build
npm run e2e      # screenshots on emulated iPhone 15 and Pixel 7
```

## Docs
[Pacenote spec](docs/PACENOTE-SPEC.md) · [Data and terms](docs/DATA-AND-TERMS.md) · [Security](docs/SECURITY.md) · [Growth and revenue](docs/GROWTH-AND-REVENUE.md) · [Roadmap](docs/ROADMAP.md) · [Trademark brief](docs/TRADEMARK-BRIEF.md)

Map data © OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap. License: not yet chosen (all rights reserved until then).

## Brand
The logo is "Navi." in Barlow Condensed Bold Italic with a red full stop. `python3 brand/make-logo.py` rebuilds everything from the font: the app icon and splash, every colour version and event variant in `brand/logo/` (dark, light, red, yellow, mono, stacked, wide "Navi. Rally", round badges), and the native icons in `brand/native/`. `npm run icons` renders the PWA icons from `public/favicon.svg`. Older, rejected concepts remain in `brand/` for reference. Trademark hand-over note: [docs/TRADEMARK-BRIEF.md](docs/TRADEMARK-BRIEF.md).
