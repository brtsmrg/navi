# Roadmap

1. **Live validation.** Run `LIVE=1 npm run test:live` against real roads (a 48-hairpin pass, a known rally stage) and compare with published road books or a driver's notes. Confirm Valhalla maneuver type codes against live responses (mapped from the API docs, not yet checked against live output).
2. **Native builds green.** Run the Android and iPhone workflows; fix anything CI finds; compile the xtool shell.
3. **Offline.** Cache a planned stage and the map tiles for it.
4. **Release signing.** Android release keystore; iPhone App Store route (paid Apple Developer Program).
5. **Road cards and share image.** See docs/GROWTH-AND-REVENUE.md.
6. **Self-hosted routing and search** before any public launch.
7. **Background-capable native tracking** (iOS and Android location services) so the screen can sleep.
8. **Community layer** (the acquisition story, see docs/ACQUISITION-READINESS.md): driver corrections on any call, road ratings, opt-in "real corner speed" sharing, club and event stages. Needs Terms of Service, privacy policy and consent first.
9. **Name clearance** before wider branding.
10. **Done in the UI overhaul:** saved places, favourites, history, route options, near-me search, long-press pin, plain-word turn cards, audio cues. **Also done:** offline map tiles for places you have already viewed, share a route link. **Also done (rally pass):** editable pacenotes saved per route, driver corrections while driving, stage view with a start count, share links that carry names and edits, light/dark/match-phone theme, new Navi logo with colour sets and native icons. **Also done:** rally-computer stage view, vehicle marker choice, magenta-to-ice turn colours. **Built but switched off:** a traffic outline (green, orange, red, dark red) with sample, TomTom and HERE sources; there is no Settings switch for it yet, because it needs a real key and a phone test first. **Next:** turn-by-turn lane hints, Android Auto and CarPlay, sharing edits through a server once accounts exist (item 8).
