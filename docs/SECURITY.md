# Security and privacy

- **No accounts, no analytics, no backend.** Location and settings stay on the phone (settings in localStorage). Share links carry only route waypoints in the URL hash, which browsers do not send to servers.
- **Network allowlist.** The production Content-Security-Policy (`public/_headers`) allows only the app's own files plus the map, routing and search hosts. No third-party scripts. Fonts are bundled.
- **HTTPS only.** All service URLs are https; the native shells set `allowMixedContent: false`.
- **Least privilege.** The apps request location (while in use) and keep-awake only. No camera, microphone, contacts or background location.
- **Untrusted input.** GPX files are size-limited (20 MB) and parsed without executing anything; share links are validated and capped at 25 waypoints.
- **Supply chain.** Few dependencies, lockfile committed, CI uses `npm ci`. GitHub Actions are pinned to major versions; pin them to commit SHAs before a public launch. Run `npm audit` before releases.
- **Verifiable builds.** CI prints SHA-256 for the APK and IPA.
- **Not verified here:** the `_headers` CSP is enforced by hosts that support it (Netlify, Cloudflare Pages); GitHub Pages ignores `_headers`, so the Pages test build runs without the CSP. Use a host that supports headers for production.

## Driving safety
First launch shows a safety gate. The Stage profile (later calls, higher corner speeds) is off until the user states they are on a closed course. Copy says the notes help you see further, not go faster. Do not remove these.
