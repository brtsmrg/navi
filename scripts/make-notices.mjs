// Writes public/licenses.txt: every package that ships in the app, with its licence and copyright text.
// Run `npm run notices` after adding or updating a dependency, then commit the file.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable', '--long'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const dirs = [...new Set(raw.split('\n').map((l) => l.split(':')[0].trim()).filter((p) => p && existsSync(join(p, 'package.json'))))];

const pkgs = [];
for (const dir of dirs) {
  const j = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (!j.name || j.name === 'navi' || dir === process.cwd()) continue;
  const lic = readdirSync(dir).find((f) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(f));
  let text = '';
  if (lic) text = readFileSync(join(dir, lic), 'utf8').trim();
  const license = typeof j.license === 'string' ? j.license : j.license?.type ?? (j.licenses ? j.licenses.map((l) => l.type).join(' OR ') : 'see package');
  const repo = (typeof j.repository === 'string' ? j.repository : j.repository?.url ?? j.homepage ?? '').replace(/^git\+/, '');
  pkgs.push({ name: j.name, version: j.version, license, repo, text });
}
pkgs.sort((a, b) => a.name.localeCompare(b.name));

const head = [
  'Navi includes the open-source software below. Each package keeps its own licence.',
  'Map data is © OpenStreetMap contributors, available under the Open Database Licence (ODbL): https://www.openstreetmap.org/copyright',
  'Free voice model: Kokoro-82M (Apache License 2.0), https://huggingface.co/hexgrad/Kokoro-82M',
  'Logo letters: Barlow Condensed, © The Barlow Project Authors, SIL Open Font License 1.1.',
  '',
  `Packages: ${pkgs.length}`,
  '',
];
const body = pkgs.map((p) => [`${'='.repeat(72)}`, `${p.name} ${p.version}  [${p.license}]`, p.repo, '', p.text || '(No licence file in the package. The licence named above applies.)', ''].join('\n'));
writeFileSync(join('public', 'licenses.txt'), head.join('\n') + body.join('\n') + '\n');
console.log(`licenses.txt: ${pkgs.length} packages`);
