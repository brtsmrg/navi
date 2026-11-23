# Running Navi on iPhone and Android

Navi is one codebase with four ways onto a phone. Start with 1; it takes two minutes and needs nothing installed.

| # | Route | Phone | Cost | Needs | Lasts |
|---|-------|-------|------|-------|-------|
| 1 | Installable web app (PWA) | iPhone and Android | Free | GitHub repo with Pages on | Always |
| 2 | Android test APK | Android | Free | GitHub Actions | Until you uninstall |
| 3 | iPhone test IPA (unsigned) | iPhone | Free | GitHub Actions + SideStore, AltStore or Sideloadly + free Apple ID | 7 days, max 3 apps |
| 4 | xtool shell | iPhone | Free | Windows PC with WSL, Apple ID, Xcode download, USB cable | 7 days, max 3 apps |

## 1. Web app (recommended first test)
1. Push this repo to GitHub. In **Settings > Pages**, set Source to **GitHub Actions**. (Free for public repos; private repos need a paid plan.)
2. The "Deploy web app" workflow publishes `https://<you>.github.io/<repo>/`.
3. iPhone: open it in **Safari**, tap Share, then **Add to Home Screen**. Android: open in Chrome, tap **Install app**.
4. Tap **Try a demo stage**, then **Watch a demo drive**. Tap once for voice: iOS only allows speech after a tap.

Phone behaviour to know about:
- The screen must stay on. Web apps cannot track GPS in the background on either platform. Navi asks the phone to keep the screen awake (iOS 16.4 and later; Android Chrome).
- Location needs HTTPS (Pages provides it) and your permission.

## 2. Android test APK
1. GitHub > **Actions > Android test APK > Run workflow**.
2. When it finishes, open the run and download the artifact **Navi-android-debug** (contains `app-debug.apk` and `SHA256.txt`).
3. Copy the APK to the phone, open it, and allow installs from that source when asked.
Debug APKs are for testing only. Release signing comes later (docs/ROADMAP.md).

Both native builds use the Navi icon and a black splash with the Navi logo: `scripts/native-patch.mjs` copies the artwork from `brand/native/` (made by `brand/make-logo.py`) over the default Capacitor files. Not yet seen on a real device.

## 3. iPhone test IPA (no Mac needed)
Apple only runs apps signed to a device. The workflow builds the app on a free GitHub macOS machine, unsigned; you sign it on your own phone with your free Apple ID.
1. **Actions > iPhone test IPA (unsigned) > Run workflow**, then download **Navi-iphone-unsigned**.
2. Install **SideStore** (no computer needed after setup), **AltStore** or **Sideloadly** (Windows), and add the IPA.
3. Free Apple IDs allow apps for 7 days and 3 apps at a time. The tool re-signs it for you while it is running.

## 4. xtool on your Windows PC (native build without a Mac)
xtool builds and signs iPhone apps from Swift packages on Linux, and on Windows through WSL. The shell in `xtool-shell/` wraps the web app in a native WKWebView.
Follow the official install page for Linux and Windows (xtool.sh, "Installation: Linux") for exact commands. The sequence is:
1. Install WSL2 with Ubuntu and a recent Swift toolchain.
2. Install xtool, then run `xtool setup`. It asks for your Apple ID and for the Xcode download (`Xcode.xip`) from Apple's developer site. **You** must sign in; nobody else can do this for you.
3. Connect the iPhone by USB (WSL needs usbipd-win to see it), unlock it and tap **Trust**. Turn on **Developer Mode** (Settings > Privacy & Security).
4. In the repo: `npm ci && npm run xtool:sync`, then `cd xtool-shell && xtool dev`.
App icon: `xtool.yml` points at `Resources/AppIcon.png` (the Navi icon, 1024 px). The `iconPath` key comes from third-party xtool guides, not the official page, so check it on the first build.
Status: the Swift files and `xtool.yml` follow xtool's documented project layout but have **not been compiled** yet. Expect a small fix or two on the first build. If it fights you, use route 3.
Open question: whether location works inside the `navi://` scheme of the xtool shell is unverified. Capacitor (routes 2 and 3) uses the common, proven pattern.

## What has and has not been verified
Verified in the build environment: type check, lint, 83 unit tests, production build, both native projects generate, the location-permission patch applies, the app runs without console errors on emulated iPhone 15 and Pixel 7 (Chromium engine), no horizontal overflow, all touch targets 44 px or larger.
Not verified (needs a real device or CI): the CI workflows running to green, Safari/WebKit rendering, iOS speech voices, GPS on a moving phone, the xtool build.
