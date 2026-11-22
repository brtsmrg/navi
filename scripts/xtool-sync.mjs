// Copies the production web build into the xtool shell so `xtool dev` can bundle it.
// Usage: npm run xtool:sync   (runs the build first)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const src = 'dist';
const dest = 'xtool-shell/Sources/Navi/web';
if (!existsSync(`${src}/index.html`)) {
  console.error('dist/index.html is missing. Run "npm run build" first.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(dest)) if (f !== '.gitkeep') rmSync(`${dest}/${f}`, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
