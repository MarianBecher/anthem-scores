import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Anthem, AnthemIndex, Note } from '../src/index.ts';
import { anthemsDir } from '../src/node.ts';

interface PackageJson {
  files: string[];
  exports: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
}
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as PackageJson;

describe('package', () => {
  test('anthemsDir() points to the note data', () => {
    const dir = anthemsDir();
    expect(dir.endsWith('anthems')).toBe(true);
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as AnthemIndex;
    expect(existsSync(join(dir, index.DE!.file))).toBe(true);
  });

  test('ships only data, types and credits, without runtime dependencies', () => {
    expect(pkg.files).toEqual(['dist', 'anthems', 'CREDITS.md']);
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.exports)).toEqual(['.', './node', './anthems/*', './index.json', './package.json']);
    expect(pkg.exports['./index.json']).toBe('./anthems/index.json');
  });

  test('the types describe the files', () => {
    expectTypeOf<Anthem['melody'][number]>().toEqualTypeOf<Note>();
    expectTypeOf<Anthem['key']['mode']>().toEqualTypeOf<'major' | 'minor'>();
    expectTypeOf<AnthemIndex[string]>().toEqualTypeOf<{ title: string; file: string }>();
  });
});
