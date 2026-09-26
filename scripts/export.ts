// Copies anthems/ to <target>/audio/anthems - so the data lands where a
// game serves it as static files, e.g. the client of geo-battle:
//
//   npm run export -- ../geo-battle/client
//
// The target directory is emptied first, so removed anthems do not linger.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT } from './lib/cache.ts';

const target = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!target) {
  console.error('Usage: npm run export -- <target directory>');
  process.exit(1);
}
const src = join(ROOT, 'anthems');
if (!existsSync(join(src, 'index.json'))) {
  console.error('anthems/ is empty - run `npm run build` first.');
  process.exit(1);
}
const dest = join(resolve(target), 'audio', 'anthems');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
const count = Object.keys(JSON.parse(readFileSync(join(src, 'index.json'), 'utf8')) as object).length;
console.log(`${count} entries -> ${dest}`);
