import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const entries = Object.entries(lock.packages).filter(([key, value]) => key && !value.dev && !value.optional);
// Vite's modulepreload helper is also present in the browser bundle.
if (lock.packages['node_modules/vite']) entries.push(['node_modules/vite', lock.packages['node_modules/vite']]);
const records = [];
const texts = ['Re.route — third-party software notices\nGenerated from package-lock.json and installed package licence files.\nThese licences apply to the named components, not to all Re.route code or external data.\n'];
for (const [directory, info] of entries.sort(([a], [b]) => a.localeCompare(b))) {
  const pkg = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const file = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING'].map(n => path.join(directory, n)).find(existsSync)
    ?? (pkg.name === '@nodable/entities' ? 'notices/nodable-entities-LICENSE' : undefined);
  if (!file) throw new Error(`Missing licence text for ${pkg.name}; review before distribution.`);
  const license = readFileSync(file, 'utf8').trim();
  if (pkg.version !== info.version || !license) throw new Error(`Dependency/licence mismatch for ${pkg.name}`);
  records.push({ name: pkg.name, version: info.version, licence: info.license, scope: pkg.name === 'vite' ? 'bundled modulepreload helper' : 'runtime',
    ...(pkg.name === '@nodable/entities' ? { licenceSource: 'https://github.com/nodable/val-parsers/blob/main/LICENSE', reviewed: '2026-10-11' } : {}) });
  texts.push(`${pkg.name} ${pkg.version} (${info.license})\n${'='.repeat(72)}\n${license}\n`);
}
const outputs = { 'public/third-party-notices.txt': texts.join('\n'), 'public/third-party-dependencies.json': JSON.stringify(records, null, 2) + '\n' };
mkdirSync('public', { recursive: true });
for (const [file, body] of Object.entries(outputs)) {
  if (process.argv.includes('--check')) { if (!existsSync(file) || readFileSync(file, 'utf8') !== body) throw new Error(`${file} is out of date. Regenerate and review notices.`); }
  else writeFileSync(file, body);
}
console.log(JSON.stringify({ packages: records.length, status: process.argv.includes('--check') ? 'verified' : 'generated' }));
