/**
 * Tariff season check: which books need a new financial year's file?
 *
 * Usage: tsx scripts/season-check.ts [--today 2027-04-05] [--json]
 *
 * A book is "overdue" when its latest file is older than the current financial year,
 * and "due soon" within 45 days before its regulator's usual revision month (April by
 * default; e.g. July for Tamil Nadu). Output is a Markdown checklist for the tracking issue.
 */
import { parseArgs } from 'node:util';
import type { TariffBook } from '../packages/data/src/types.js';
import { loadData } from './lib/data-files.js';

export type SeasonStatus = 'current' | 'due_soon' | 'overdue';

export interface SeasonRow {
  readonly bookId: string;
  readonly title: string;
  readonly regulator: string;
  readonly regulatorUrl: string;
  readonly latestFy: string;
  readonly expectedFy: string;
  readonly revisionMonth: number;
  readonly status: SeasonStatus;
}

export function financialYearOf(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const fyLabel = (start: number): string => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
const DUE_SOON_DAYS = 45;

export function seasonRow(latest: TariffBook, today: Date): SeasonRow {
  const revisionMonth = latest.revision?.month ?? 4;
  // The revision belonging to FY starting in year y happens in revisionMonth of y (Jan-Mar: y + 1).
  const revisionFor = (fyStart: number): number => Date.UTC(revisionMonth >= 4 ? fyStart : fyStart + 1, revisionMonth - 1, 1);
  const fyStart = Number(financialYearOf(today).slice(0, 4));
  const now = today.getTime();
  const thisRevision = revisionFor(fyStart);
  const last = now >= thisRevision ? fyStart : fyStart - 1;
  const next = now >= thisRevision ? { fy: fyStart + 1, date: revisionFor(fyStart + 1) } : { fy: fyStart, date: thisRevision };
  const latestStart = Number(latest.financialYear.slice(0, 4));

  let status: SeasonStatus = 'current';
  let expectedFy = latest.financialYear;
  if (latestStart < last) {
    status = 'overdue';
    expectedFy = fyLabel(last);
  } else if ((next.date - now) / 86_400_000 <= DUE_SOON_DAYS && latestStart < next.fy) {
    status = 'due_soon';
    expectedFy = fyLabel(next.fy);
  }
  return {
    bookId: latest.bookId,
    title: latest.title,
    regulator: latest.regulator.short,
    regulatorUrl: latest.regulator.url,
    latestFy: latest.financialYear,
    expectedFy,
    revisionMonth,
    status,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function renderChecklist(rows: readonly SeasonRow[], today: Date): string {
  const label: Record<SeasonStatus, string> = { overdue: 'OVERDUE', due_soon: 'due soon', current: 'current' };
  const lines = [
    `## Tariff season checklist (${today.toISOString().slice(0, 10)})`,
    '',
    'Tick a box once a PR with the new book is merged. See docs/tariff-update-workflow.md.',
    '',
  ];
  const rank: Record<SeasonStatus, number> = { overdue: 0, due_soon: 1, current: 2 };
  for (const row of rows.toSorted((a, b) => rank[a.status] - rank[b.status] || a.bookId.localeCompare(b.bookId))) {
    const done = row.status === 'current' ? 'x' : ' ';
    lines.push(
      `- [${done}] **${row.bookId}** (${row.regulator}, usually ${MONTHS[row.revisionMonth - 1]}): latest ${row.latestFy}, expected ${row.expectedFy} [${label[row.status]}] - ${row.regulatorUrl}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { today: { type: 'string' }, json: { type: 'boolean' } } });
  const today = values.today ? new Date(`${values.today}T00:00:00Z`) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`--today must be YYYY-MM-DD (got "${values.today}")`);
  const { books } = await loadData();
  const latest = new Map<string, TariffBook>();
  for (const { book } of books) {
    const current = latest.get(book.bookId);
    if (!current || current.effectiveFrom < book.effectiveFrom) latest.set(book.bookId, book);
  }
  const rows = [...latest.values()].map((book) => seasonRow(book, today));
  process.stdout.write(values.json ? `${JSON.stringify(rows, null, 2)}\n` : renderChecklist(rows, today));
}

if (process.argv[1]?.includes('season-check')) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
