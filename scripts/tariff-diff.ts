/**
 * Summarise tariff changes for a pull request: what moved, and what it does to bills.
 *
 * Usage: tsx scripts/tariff-diff.ts [--base origin/main] [--out diff.md]
 *
 * For every tariff file changed against the base ref: if the file existed at base, it is
 * an erratum and is compared with the base version; if it is new, it is compared with the
 * previous financial year's book for the same bookId.
 */
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { validateBook } from '../packages/data/src/validate.js';
import type { TariffBook } from '../packages/data/src/types.js';
import { computeBill } from '../packages/engine/src/bill/compute.js';
import { ROOT, loadData } from './lib/data-files.js';

const SAMPLE_UNITS = [100, 200, 300, 500];
const SAMPLE_LOAD_KW = 3;
const SKIP_KEYS = new Set(['cite', 'sources', 'changelog', 'note', 'notes', 'description', 'eligibility', 'applicability', '$schema', 'gaps']);

export interface Change {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** Leaf-level differences between two JSON values, skipping prose and citations. */
export function diffValues(before: unknown, after: unknown, at = ''): Change[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = (list: unknown[]) => list.every((v) => isObj(v) && typeof v.id === 'string');
    if (keyed(before) && keyed(after)) {
      const byId = (list: unknown[]) => new Map(list.map((v) => [(v as { id: string }).id, v]));
      const a = byId(before);
      const b = byId(after);
      return [...new Set([...a.keys(), ...b.keys()])].flatMap((id) => diffValues(a.get(id), b.get(id), `${at}[${id}]`));
    }
    const length = Math.max(before.length, after.length);
    return Array.from({ length }, (_, i) => diffValues(before[i], after[i], `${at}[${i}]`)).flat();
  }
  if (isObj(before) && isObj(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !SKIP_KEYS.has(key))
      .flatMap((key) => diffValues(before[key], after[key], at ? `${at}.${key}` : key));
  }
  return [{ path: at, before, after }];
}

/** Make data text safe inside a Markdown table cell. */
export function cell(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/([|`\\<>[\]])/g, '\\$1').replace(/@/g, '@\u200b');
}

function show(value: unknown): string {
  if (value === undefined) return '(none)';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return cell(text.length > 60 ? `${text.slice(0, 57)}...` : text);
}

function totalOrError(book: TariffBook, units: number): string {
  try {
    return `₹${computeBill(book, { units, sanctionedLoadKw: SAMPLE_LOAD_KW }).total.toFixed(2)}`;
  } catch (error: unknown) {
    return `error: ${cell(error instanceof Error ? error.message : String(error))}`;
  }
}

function billImpact(previous: TariffBook | null, current: TariffBook): string[] {
  const lines = ['', `| kWh/cycle (${SAMPLE_LOAD_KW} kW) | ${previous ? `${previous.financialYear} | ` : ''}${current.financialYear} | change |`, `|---|${previous ? '---|' : ''}---|---|`];
  for (const units of SAMPLE_UNITS) {
    const now = totalOrError(current, units);
    if (!previous) {
      lines.push(`| ${units} | ${now} | new |`);
      continue;
    }
    const was = totalOrError(previous, units);
    const a = Number(was.slice(1));
    const b = Number(now.slice(1));
    const change = Number.isFinite(a) && Number.isFinite(b) ? `₹${(b - a).toFixed(2)}${a !== 0 ? ` (${(((b - a) / a) * 100).toFixed(1)}%)` : ''}` : 'n/a';
    lines.push(`| ${units} | ${was} | ${now} | ${change} |`);
  }
  lines.push('', '_Bills include automatic subsidies; opt-in schemes and variable charges as in each book._');
  return lines;
}

function hygiene(book: TariffBook): string[] {
  const notes: string[] = [];
  const unhashed = Object.entries(book.sources).filter(([, s]) => !s.sha256 && s.type !== 'news').map(([k]) => k);
  if (unhashed.length > 0) notes.push(`- ${unhashed.length} primary source(s) without sha256: ${unhashed.join(', ')}`);
  const text = JSON.stringify(book);
  const unverified = (text.match(/"verification":"unverified"/g) ?? []).length;
  const secondary = (text.match(/"verification":"secondary"/g) ?? []).length;
  notes.push(`- verification: ${unverified} unverified, ${secondary} secondary block(s); status **${book.status}**, ${book.gaps.length} gap(s)`);
  return notes;
}

function gitShow(ref: string, file: string): unknown | null {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as unknown;
  } catch {
    return null;
  }
}

function changedFiles(base: string): string[] | null {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`, '--', 'data/tariffs'], { cwd: ROOT, encoding: 'utf8' });
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'data/tariffs'], { cwd: ROOT, encoding: 'utf8' });
    return [...new Set(`${out}\n${untracked}`.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('.json')))];
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { base: { type: 'string' }, out: { type: 'string' }, all: { type: 'boolean' } } });
  const base = values.base ?? 'origin/main';
  if (!/^[A-Za-z0-9._/-]+$/.test(base) || base.startsWith('-')) throw new Error(`--base must be a ref name (got "${base}")`);
  const { books, errors } = await loadData();
  const sections: string[] = ['## Tariff data changes', ''];
  if (errors.length > 0) sections.push(`**${errors.length} validation error(s)**; fix them first:`, '', ...errors.slice(0, 20).map((e) => `- ${cell(e)}`), '');

  const changed = values.all ? books.map((b) => b.file) : changedFiles(base);
  if (changed === null) sections.push(`_Could not diff against \`${base}\`; listing all books._`, '');
  const targets = books.filter((b) => (changed ?? books.map((x) => x.file)).includes(b.file));
  if (targets.length === 0) sections.push('No tariff books changed.');

  for (const { file, book } of targets) {
    const baseJson = gitShow(base, file);
    const baseBook = baseJson ? validateBook(baseJson) : null;
    const previous =
      baseBook?.ok === true
        ? baseBook.value
        : (books
            .filter((b) => b.book.bookId === book.bookId && b.book.effectiveFrom < book.effectiveFrom)
            .map((b) => b.book)
            .toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
            .at(-1) ?? null);
    const kind = baseBook?.ok ? 'erratum (file existed at base)' : previous ? `new year vs ${previous.financialYear}` : 'new book';
    sections.push(`### ${cell(book.title)}, FY ${book.financialYear}`, '', `${cell(file)}: ${kind}; effective ${book.effectiveFrom}; ${cell(book.utilities.map((u) => u.shortName).join(', '))}`, '');
    if (previous) {
      const changes = diffValues(previous, book).filter((c) => !['financialYear', 'effectiveFrom', 'effectiveTo'].includes(c.path));
      if (changes.length === 0) sections.push('No rate or rule changes.');
      else {
        sections.push('| field | before | after |', '|---|---|---|');
        for (const c of changes.slice(0, 60)) sections.push(`| ${cell(c.path)} | ${show(c.before)} | ${show(c.after)} |`);
        if (changes.length > 60) sections.push(`| ... | ${changes.length - 60} more | |`);
      }
    }
    sections.push(...billImpact(previous, book), '', ...hygiene(book), '');
  }

  const markdown = `${sections.join('\n')}\n`;
  if (values.out) await writeFile(path.resolve(values.out), markdown);
  else process.stdout.write(markdown);
}

if (process.argv[1] && path.resolve(process.argv[1]).includes('tariff-diff')) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
