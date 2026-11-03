/**
 * Reads and validates everything under data/. Shared by the build, diff and season scripts.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateBook,
  validateNationalFile,
  validateSolarResourceFile,
} from '../../packages/data/src/validate.js';
import type { Catalog, NationalFile, SolarResourceFile, TariffBook } from '../../packages/data/src/types.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const TARIFF_DIR = path.join(DATA_DIR, 'tariffs');

export interface LoadedBook {
  readonly file: string;
  readonly book: TariffBook;
}

export interface LoadResult {
  readonly catalog: Catalog | null;
  readonly books: readonly LoadedBook[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

async function readJson(file: string): Promise<unknown> {
  const text = await readFile(file, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path.relative(ROOT, file)}: invalid JSON (${message})`);
  }
}

export async function listTariffFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(TARIFF_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(TARIFF_DIR, entry.name);
    for (const file of await readdir(dir)) {
      if (file.endsWith('.json')) files.push(path.join(dir, file));
    }
  }
  return files.toSorted();
}

export async function loadData(): Promise<LoadResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const books: LoadedBook[] = [];

  for (const file of await listTariffFiles()) {
    const rel = path.relative(ROOT, file).replaceAll('\\', '/');
    let json: unknown;
    try {
      json = await readJson(file);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const result = validateBook(json);
    if (!result.ok) {
      errors.push(...result.errors.map((e) => `${rel}: ${e}`));
      continue;
    }
    const book = result.value;
    const expectedDir = path.basename(path.dirname(file));
    const expectedName = `${book.financialYear}.json`;
    if (expectedDir !== book.bookId) errors.push(`${rel}: bookId "${book.bookId}" must match its folder "${expectedDir}"`);
    if (path.basename(file) !== expectedName) errors.push(`${rel}: file must be named ${expectedName}`);
    warnings.push(...bookWarnings(rel, book));
    books.push({ file: rel, book });
  }

  let solar: SolarResourceFile | null = null;
  const solarResult = validateSolarResourceFile(await readJson(path.join(DATA_DIR, 'solar', 'nasa-power.json')));
  if (solarResult.ok) solar = solarResult.value;
  else errors.push(...solarResult.errors.map((e) => `data/solar/nasa-power.json: ${e}`));

  let national: NationalFile | null = null;
  const nationalResult = validateNationalFile(await readJson(path.join(DATA_DIR, 'national', 'india.json')));
  if (nationalResult.ok) national = nationalResult.value;
  else errors.push(...nationalResult.errors.map((e) => `data/national/india.json: ${e}`));

  errors.push(...crossFileErrors(books, solar));

  const catalog: Catalog | null =
    errors.length === 0 && solar && national ? { books: books.map((b) => b.book), solar, national } : null;
  return { catalog, books, errors, warnings };
}

function bookWarnings(rel: string, book: TariffBook): string[] {
  const warnings: string[] = [];
  const unhashed = Object.entries(book.sources).filter(([, s]) => !s.sha256 && s.type !== 'news');
  if (unhashed.length > 0) {
    warnings.push(`${rel}: ${unhashed.length} primary source(s) lack sha256 (run npm run data:hash -- <url>)`);
  }
  let unverified = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.verification === 'unverified') unverified += 1;
      Object.values(record).forEach(walk);
    }
  };
  walk(book);
  if (unverified > 0) warnings.push(`${rel}: ${unverified} block(s) marked unverified`);
  if (book.status !== 'complete' && book.gaps.length === 0) {
    warnings.push(`${rel}: status is ${book.status} but no gaps are listed`);
  }
  return warnings;
}

function crossFileErrors(books: readonly LoadedBook[], solar: SolarResourceFile | null): string[] {
  const errors: string[] = [];
  const locations = new Set(solar?.locations.map((l) => l.id) ?? []);
  const seen = new Map<string, string>();
  const utilityOwner = new Map<string, string>();

  for (const { file, book } of books) {
    const key = `${book.bookId}@${book.financialYear}`;
    if (seen.has(key)) errors.push(`${file}: duplicate of ${seen.get(key)}`);
    seen.set(key, file);

    for (const utility of book.utilities) {
      if (solar && !locations.has(utility.solarResource)) {
        errors.push(`${file}: utility ${utility.id} uses unknown solar resource "${utility.solarResource}"`);
      }
      const owner = utilityOwner.get(utility.id);
      if (owner && owner !== book.bookId) {
        errors.push(`${file}: utility ${utility.id} already belongs to book ${owner}`);
      }
      utilityOwner.set(utility.id, book.bookId);
    }
  }
  return errors;
}
