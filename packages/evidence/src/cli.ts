#!/usr/bin/env node
/**
 * meter-sakshi CLI
 *
 *   meter-sakshi verify   <log.csv>
 *   meter-sakshi report   --log log.csv --case case.json [--out report.html] [--md report.md]
 *   meter-sakshi simulate --days 30 [--daily 8] [--imp 3200] [--out sample.csv]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseCaseFile } from './case.js';
import { parseLog } from './log/parse.js';
import { verifyChain } from './log/verify.js';
import { buildReport } from './report/build.js';
import { renderHtml } from './report/html.js';
import { renderMarkdown } from './report/markdown.js';
import { simulateLog } from './simulate.js';
import { rightsFor, tariffComputerFor } from './wiring.js';

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function verify(path: string | undefined): Promise<void> {
  if (!path) throw new Error('usage: meter-sakshi verify <log.csv>');
  const log = parseLog(await readFile(path, 'utf8'));
  const result = await verifyChain(log);
  out(result.message);
  if (!result.ok) process.exitCode = 2;
}

async function report(values: Record<string, string | undefined>): Promise<void> {
  if (!values.log || !values.case) throw new Error('usage: meter-sakshi report --log log.csv --case case.json [--out report.html] [--md report.md]');
  const log = parseLog(await readFile(values.log, 'utf8'));
  const caseFile = parseCaseFile(JSON.parse(await readFile(values.case, 'utf8')) as unknown);
  const result = await buildReport({ log, caseFile, billFor: tariffComputerFor(caseFile), rights: rightsFor(caseFile.utilityId) });
  const htmlPath = values.out ?? 'meter-sakshi-report.html';
  await writeFile(htmlPath, renderHtml(result));
  if (values.md) await writeFile(values.md, renderMarkdown(result));
  for (const f of result.findings) out(`[${f.severity.toUpperCase()}] ${f.title}`);
  out(`\nWrote ${htmlPath}${values.md ? ` and ${values.md}` : ''}`);
}

function positive(value: string | undefined, fallback: string, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive number`);
  return parsed;
}

async function simulate(values: Record<string, string | undefined>): Promise<void> {
  const days = positive(values.days, '7', 'days');
  const { text } = await simulateLog({
    startIso: values.start ?? '2026-10-01T00:00:00+05:30',
    days,
    dailyKwh: positive(values.daily, '8', 'daily'),
    impPerKwh: positive(values.imp, '3200', 'imp'),
    digests: true,
  });
  const path = values.out ?? 'meter-sakshi-sample.csv';
  await writeFile(path, text);
  out(`Wrote ${days} day(s) to ${path}`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      log: { type: 'string' },
      case: { type: 'string' },
      out: { type: 'string' },
      md: { type: 'string' },
      days: { type: 'string' },
      daily: { type: 'string' },
      imp: { type: 'string' },
      start: { type: 'string' },
    },
  });
  switch (positionals[0]) {
    case 'verify':
      return verify(positionals[1]);
    case 'report':
      return report(values);
    case 'simulate':
      return simulate(values);
    default:
      out('usage: meter-sakshi verify <log.csv> | report --log L --case C | simulate --days N');
      process.exitCode = positionals[0] ? 1 : 0;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
