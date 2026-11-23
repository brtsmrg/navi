// Adds what a fresh `cap add android|ios` project lacks: location permission, and a sensible iOS Info.plist.
// Usage: node scripts/native-patch.mjs android|ios   (idempotent; safe to run twice)
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';

const platform = process.argv[2];

/** Copy a brand file over a project file, only when both exist. Never fails the build over artwork. */
function put(from, to) {
  if (!existsSync(from) || !existsSync(to)) return false;
  copyFileSync(from, to);
  return true;
}


function patch(file, edit) {
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run "npx cap add ${platform}" first.`);
  const before = readFileSync(file, 'utf8');
  const after = edit(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`${after === before ? 'unchanged' : 'patched  '} ${file}`);
}

if (platform === 'android') {
  patch('android/app/src/main/AndroidManifest.xml', (x) => {
    const perms = [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.WAKE_LOCK',
    ].filter((p) => !x.includes(p));
    if (!perms.length) return x;
    const lines = perms.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
    return x.replace('</manifest>', `${lines}\n</manifest>`);
  });
  // Navi icons and splash (brand/native, made by brand/make-logo.py)
  const res = 'android/app/src/main/res';
  let n = 0;
  for (const dens of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      if (put(`brand/native/android/mipmap-${dens}/${f}`, `${res}/mipmap-${dens}/${f}`)) n++;
    }
  }
  if (existsSync(`${res}/values/ic_launcher_background.xml`)) {
    patch(`${res}/values/ic_launcher_background.xml`, (x) => x.replace(/(<color name="ic_launcher_background">)[^<]*(<\/color>)/, '$1#000000$2'));
  }
  if (existsSync(res)) {
    for (const d of readdirSync(res)) if (d.startsWith('drawable') && put('brand/native/splash.png', `${res}/${d}/splash.png`)) n++;
  }
  console.log(`brand artwork   ${n} Android file(s) replaced`);
} else if (platform === 'ios') {
  patch('ios/App/App/Info.plist', (x) => {
    if (x.includes('NSLocationWhenInUseUsageDescription')) return x;
    const add = `\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>Navi uses your location to call corners ahead of you. It never leaves your phone.</string>\n\t<key>UIRequiresFullScreen</key>\n\t<true/>\n`;
    return x.replace(/<\/dict>\s*<\/plist>/, `${add}</dict>\n</plist>`);
  });
  const assets = 'ios/App/App/Assets.xcassets';
  let n = put('brand/native/ios/AppIcon-512@2x.png', `${assets}/AppIcon.appiconset/AppIcon-512@2x.png`) ? 1 : 0;
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    if (put('brand/native/splash.png', `${assets}/Splash.imageset/${f}`)) n++;
  }
  console.log(`brand artwork   ${n} iPhone file(s) replaced`);
} else {
  console.error('Usage: node scripts/native-patch.mjs android|ios');
  process.exit(1);
}
