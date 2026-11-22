# Building Navi so a big maps company would want it

Goal from the founder: be the maps app a company like Google buys, as it bought Waze (2013).
Nobody can promise an acquisition. What can be done is to build the things an acquirer pays for and keep the company easy to buy.

## What made Waze worth buying
Waze had something Google Maps did not: a large, loyal community whose live reports made the map better for everyone. The lesson is a data flywheel plus a passionate user group, not a clever feature.

## Navi's version of that
1. **A community of fast, careful drivers and rally fans** who care about roads the big apps ignore.
2. **A dataset nobody else has:** corner-by-corner pacenotes for real roads, corrected and rated by drivers. Today the notes are computed from map geometry (tested against known radii and the real Stelvio road). The next layer is driver feedback ("this call was wrong", "too early", "real comfortable speed").
3. **A signature experience** that is easy to show in a short video: the road sketch, the call, the slide.
Plan for these in docs/ROADMAP.md. None of them exist yet except the engine and the app shell.

## Due-diligence checklist (what an acquirer's lawyers check)
| Area | Status | Evidence / next step |
|------|--------|----------------------|
| Code licences | OK | All 114 production dependencies are permissive (MIT, ISC, BSD, Apache-2.0, 0BSD, OFL fonts). No copyleft. Re-run the audit before any sale. |
| Ownership of the code | OK for now | Repo is all-rights-reserved (no open licence chosen). Anyone else who contributes must sign an IP assignment first. |
| Map data | OK | OpenStreetMap (ODbL) with attribution. Keep user-contributed data separate and owned under Terms of Service. |
| Google terms | OK | No Google data is used (docs/DATA-AND-TERMS.md). |
| Name and trademark | **Risk** | "Navi" is crowded: an iPhone app called "Navi: AI Travel & Safety Guide" is in Maps & Navigation, and Navi Technologies holds NAVI marks (mostly financial). Get a real clearance search before spending on branding. |
| Privacy | OK for now | No accounts, no analytics, location stays on the phone. Any telemetry or community feature needs consent, a privacy policy, and review for Canada (PIPEDA), EU and California rules. |
| Safety and liability | Started | Safety gate, closed-course attestation. A navigation product needs Terms of Service and a liability review before launch. |
| Traction numbers | Not started | Track: weekly active drivers, rides started, share-link opens, 30-day retention, corrections submitted. Add privacy-safe counting before claiming any number. |

## Rules for the team
1. Keep the repo clean: licence inventory in CI, no code pasted from unknown sources, no scraped data.
2. Decide the name before building the brand around it.
3. Never collect location history without explicit, revocable consent.
4. Measure what an acquirer asks about (retention, engagement, community contribution), and record how each number was counted.
