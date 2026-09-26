// Builds the note data from the curated sources (sources.json): one file
// per country in anthems/<CC>.json plus anthems/index.json, and writes
// REPORT.md and CREDITS.md.
//
//   npm run build            all countries
//   npm run build -- DE FR   only these, with a verbose log (the report and
//                            the index are not rewritten then)
//
// Conversion and checks live in scripts/lib/build.ts and scripts/lib/checks.ts.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnthemIndex } from '../src/index.ts';
import { buildOne } from './lib/build.ts';
import { readJson, ROOT } from './lib/cache.ts';
import { readWikidata } from './lib/candidates.ts';
import type { Sources } from './lib/config.ts';
import type { Countries } from './lib/countries.ts';
import { NO_SOURCE, writeReport, type CountryResult } from './lib/report.ts';

const OUT = join(ROOT, 'anthems');
const sources = readJson<Sources>('sources.json');
const countries = readJson<Countries>('countries.json');
const only = process.argv.slice(2).map((s) => s.toUpperCase());
const verbose = only.length > 0;
const codes = Object.keys(countries).filter((c) => !only.length || only.includes(c));

const sortObj = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// On a full build, empty the directory first, so removed countries leave no
// stale files behind.
if (!only.length) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const results: Record<string, CountryResult> = {};
const index: AnthemIndex = {};
for (const code of codes) {
  const cfg = sources[code];
  if (!cfg) {
    results[code] = { status: 'missing', reason: NO_SOURCE };
    continue;
  }
  if (cfg.skip) {
    results[code] = { status: 'skipped', reason: cfg.skip, cfg };
    continue;
  }
  if (cfg.missing || !cfg.src) {
    if (!cfg.sameAs) results[code] = { status: 'missing', reason: cfg.missing ?? NO_SOURCE, cfg };
    continue; // shared melodies are resolved after the anthems of their own
  }
  try {
    const r = await buildOne(code, { ...cfg, src: cfg.src }, verbose);
    const ok = r.errors.length === 0;
    results[code] = { status: ok ? 'ok' : 'error', cfg, out: r.out, src: r.src, errors: r.errors, flags: r.flags };
    if (ok) {
      writeFileSync(join(OUT, `${code}.json`), JSON.stringify(r.out) + '\n');
      index[code] = { title: cfg.title, file: `${code}.json` };
    } else rmSync(join(OUT, `${code}.json`), { force: true });
    console.log(`${ok ? (r.flags.length ? 'OK*' : 'OK ') : 'ERR'} ${code} ${cfg.title}`);
    for (const l of r.log) if (verbose || !ok) console.log('    ' + l);
    for (const f of [...r.errors, ...r.flags]) console.log('    ! ' + f);
  } catch (e) {
    results[code] = { status: 'error', reason: (e as Error).message, cfg };
    console.log(`ERR ${code}: ${(e as Error).message}`);
  }
}
for (const code of codes) {
  const cfg = sources[code];
  if (!cfg?.sameAs) continue;
  const target = index[cfg.sameAs];
  if (target) {
    index[code] = { title: cfg.title, file: target.file };
    results[code] = { status: 'ok', sameAs: cfg.sameAs, cfg };
  } else results[code] = { status: 'missing', reason: `melody of ${cfg.sameAs} not available`, cfg };
}

if (!only.length) {
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(sortObj(index), null, 1) + '\n');
  // Anthem titles for the report rows of countries without a source entry.
  const titles: Record<string, string> = {};
  for (const row of readWikidata()) {
    const label = row.anthemLabel?.value;
    if (label && !/^Q\d+$/.test(label)) titles[row.iso.value] = [...new Set([...(titles[row.iso.value]?.split(' / ') ?? []), label])].join(' / ');
  }
  writeReport({ results, countries, sources, titles });
  const ok = Object.values(results).filter((r) => r.status === 'ok').length;
  console.log(`\n${ok}/${codes.length} countries have an anthem.`);
}
