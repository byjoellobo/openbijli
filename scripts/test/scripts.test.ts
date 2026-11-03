import { describe, expect, it } from 'vitest';
import type { TariffBook } from '../../packages/data/src/types.js';
import { book } from '../../packages/engine/test/fixtures.js';
import { financialYearOf, renderChecklist, seasonRow } from '../season-check.js';
import { diffValues } from '../tariff-diff.js';
import { insertSha256 } from '../hash-source.js';

describe('hash-source', () => {
  it('inserts sha256 after the url line without reformatting', () => {
    const text = '{\n  "sources": {\n    "a": {\n      "title": "T",\n      "url": "https://x.org/a.pdf",\n      "type": "gazette"\n    }\n  }\n}\n';
    const out = insertSha256(text, 'a', 'f'.repeat(64));
    expect(out).toContain(`      "url": "https://x.org/a.pdf",\n      "sha256": "${'f'.repeat(64)}",\n      "type"`);
    expect(JSON.parse(out ?? '')).toBeTruthy();
    expect(insertSha256(text, 'missing', 'f'.repeat(64))).toBeNull();
    const lastKey = '{"sources": {\n  "b": {\n    "title": "T",\n    "url": "https://x.org/b.pdf"\n  }\n}}\n';
    expect(JSON.parse(insertSha256(lastKey, 'b', 'a'.repeat(64)) ?? '').sources.b.sha256).toBe('a'.repeat(64));
  });
});

const at = (date: string): Date => new Date(`${date}T00:00:00Z`);
const tn: TariffBook = { ...book, bookId: 'tn-test', revision: { month: 7, note: 'July revisions' } };

describe('season check', () => {
  it('derives the financial year', () => {
    expect(financialYearOf(at('2026-03-31'))).toBe('2025-26');
    expect(financialYearOf(at('2026-04-01'))).toBe('2026-27');
  });

  it('tracks April regulators through the year', () => {
    expect(seasonRow(book, at('2026-10-29')).status).toBe('current');
    const soon = seasonRow(book, at('2027-03-01'));
    expect(soon.status).toBe('due_soon');
    expect(soon.expectedFy).toBe('2027-28');
    expect(seasonRow(book, at('2027-04-10')).status).toBe('overdue');
  });

  it('respects a July revision month', () => {
    expect(seasonRow(tn, at('2027-05-01')).status).toBe('current');
    expect(seasonRow(tn, at('2027-06-01')).status).toBe('due_soon');
    expect(seasonRow(tn, at('2027-07-10')).status).toBe('overdue');
  });

  it('renders a checklist', () => {
    const text = renderChecklist([seasonRow(book, at('2027-04-10'))], at('2027-04-10'));
    expect(text).toContain('- [ ] **xx-test**');
    expect(text).toContain('OVERDUE');
  });
});

describe('tariff diff', () => {
  it('reports leaf changes by id and ignores prose and citations', () => {
    const next = structuredClone(book) as TariffBook;
    const category = next.categories[0];
    if (!category) throw new Error('fixture');
    const slab = category.energy.schedules[1]?.slabs[0];
    if (slab) slab.rate = 4.75;
    category.energy.note = 'changed prose';
    category.charges = category.charges.filter((c) => c.id !== 'ppac');
    const changes = diffValues(book, next);
    expect(changes).toContainEqual({ path: 'categories[domestic].energy.schedules[standard].slabs[0].rate', before: 4.5, after: 4.75 });
    expect(changes.some((c) => c.path.includes('[ppac]'))).toBe(true);
    expect(changes.some((c) => c.path.endsWith('note'))).toBe(false);
  });
});
