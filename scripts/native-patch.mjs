// Adds what a fresh `cap add android|ios` project lacks: location permission, and a sensible iOS Info.plist.
// Usage: node scripts/native-patch.mjs android|ios   (idempotent; safe to run twice)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const platform = process.argv[2];

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
} else if (platform === 'ios') {
  patch('ios/App/App/Info.plist', (x) => {
    if (x.includes('NSLocationWhenInUseUsageDescription')) return x;
    const add = `\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>Navi uses your location to call corners ahead of you. It never leaves your phone.</string>\n\t<key>UIRequiresFullScreen</key>\n\t<true/>\n`;
    return x.replace(/<\/dict>\s*<\/plist>/, `${add}</dict>\n</plist>`);
  });
} else {
  console.error('Usage: node scripts/native-patch.mjs android|ios');
  process.exit(1);
}
