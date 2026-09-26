/**
 * Node-only helpers for `anthem-scores`.
 *
 * @example
 * ```ts
 * import { readFileSync } from 'node:fs';
 * import { join } from 'node:path';
 * import { anthemsDir } from 'anthem-scores/node';
 * import type { Anthem, AnthemIndex } from 'anthem-scores';
 *
 * const index = JSON.parse(readFileSync(join(anthemsDir(), 'index.json'), 'utf8')) as AnthemIndex;
 * const de = JSON.parse(readFileSync(join(anthemsDir(), index.DE!.file), 'utf8')) as Anthem;
 * ```
 *
 * @packageDocumentation
 */
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the installed `anthems/` directory, which holds
 * `index.json` and one `<CC>.json` file per melody.
 */
export function anthemsDir(): string {
  // This module lives in dist/ (or src/ in the repository), next to anthems/.
  return fileURLToPath(new URL('../anthems/', import.meta.url)).replace(/[\\/]$/, '');
}
