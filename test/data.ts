// Access to the built note data in anthems/ for the tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Anthem, AnthemIndex } from '../src/index.ts';

export const ANTHEMS_DIR = join(import.meta.dirname, '..', 'anthems');
export const index = JSON.parse(readFileSync(join(ANTHEMS_DIR, 'index.json'), 'utf8')) as AnthemIndex;
export const anthemFiles = readdirSync(ANTHEMS_DIR).filter((f) => /^[A-Z]{2}\.json$/.test(f));
export const readFile = (file: string): Anthem => JSON.parse(readFileSync(join(ANTHEMS_DIR, file), 'utf8')) as Anthem;

/** The anthem of a country (through the index, so shared melodies resolve). */
export function load(code: string): Anthem {
  const entry = index[code];
  if (!entry) throw new Error(`${code} is not in anthems/index.json`);
  return readFile(entry.file);
}
