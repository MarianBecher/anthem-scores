// Download cache: every URL is fetched exactly once and stored in cache/.
// The Wikimedia APIs explicitly ask clients not to fetch the same data more
// often than necessary, and a reproducible build should produce exactly the
// same result offline (or after deleting anthems/).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const CACHE_DIR = join(ROOT, 'cache');

// Wikimedia requires a meaningful User-Agent, otherwise it answers 403.
const USER_AGENT = 'anthem-scores/0.1 (curation scripts; +https://github.com/MarianBecher/anthem-scores)';

function cachePath(url: string, ext: string): string {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  return join(CACHE_DIR, 'http', hash + ext);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Fetches a URL (through the cache) and returns its bytes. */
export async function fetchCached(url: string, { ext = '.bin' }: { ext?: string } = {}): Promise<Buffer> {
  const file = cachePath(url, ext);
  if (existsSync(file)) return readFileSync(file);
  if (process.env.OFFLINE) throw new Error(`Not in cache (OFFLINE is set): ${url}`);
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      // Treat dropped connections (ECONNRESET etc.) like 5xx.
      if (attempt < 8) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw e;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      // Courtesy pause between real network requests.
      await sleep(Number(process.env.FETCH_PAUSE_MS ?? 300));
      return buf;
    }
    // 429/5xx are usually temporary at Wikimedia -> retry with backoff.
    if ((res.status === 429 || res.status >= 500) && attempt < 8) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(retryAfter * 1000, 3000 * (attempt + 1)));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
}

/** Fetches and parses JSON (through the cache). The caller states the expected shape. */
export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse((await fetchCached(url, { ext: '.json' })).toString('utf8')) as T;
}

/** Reads a JSON file relative to the repository root. */
export function readJson<T>(...path: string[]): T {
  return JSON.parse(readFileSync(join(ROOT, ...path), 'utf8')) as T;
}
