// Lists every blank the owner still has to fill in before Navi goes to a store.
// Run: npm run launch-check   (exit code 1 while any blank is left)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'public', 'index.html'];
const found = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(ts|tsx|html|txt|json|webmanifest)$/.test(p) || /licenses\.txt$/.test(p) || /\.test\.ts$/.test(p)) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\[ADD [A-Z ]+\]/g)) found.push(`${p}:${i + 1}  ${m[0]}`);
  });
};
roots.forEach(walk);
const hard = ['https://brtsmrg.github.io/navi'];
for (const f of ['index.html', 'public/.well-known/security.txt']) {
  const t = readFileSync(f, 'utf8');
  hard.forEach((h) => t.includes(h) && found.push(`${f}  hard-coded address ${h} (change when the site moves)`));
}
if (found.length) {
  console.log(`Still to fill in (${found.length}):\n` + found.join('\n'));
  process.exit(1);
}
console.log('No blanks left.');
