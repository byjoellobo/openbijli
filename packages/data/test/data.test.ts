import { describe, expect, it } from 'vitest';
import {
  TariffLookupError,
  catalog,
  getBook,
  getBookHistory,
  getSolarResource,
  getSolarResourceForUtility,
  getTariff,
  getUtilities,
  getUtility,
} from '../src/index.js';
import { validateBook, validateNationalFile, validateSolarResourceFile } from '../src/validate.js';
import { book as fixture } from '../../engine/test/fixtures.js';

describe('bundled catalog', () => {
  it('re-validates every bundled book, the national file and the solar file', () => {
    for (const book of catalog.books) {
      const result = validateBook(book);
      expect(result.ok, `${book.bookId}: ${result.ok ? '' : result.errors.join('; ')}`).toBe(true);
    }
    expect(validateNationalFile(catalog.national).ok).toBe(true);
    expect(validateSolarResourceFile(catalog.solar).ok).toBe(true);
  });

  it('covers at least ten utilities including MESCOM', () => {
    const utilities = getUtilities();
    expect(utilities.length).toBeGreaterThanOrEqual(10);
    expect(utilities.some((u) => u.id === 'mescom')).toBe(true);
    for (const u of utilities) expect(() => getSolarResourceForUtility(u.id)).not.toThrow();
  });

  it('looks up books by utility, date, id and history', () => {
    const book = getTariff('mescom');
    expect(book.bookId).toBe('ka-kerc');
    expect(getTariff('mescom', '2026-10-01').financialYear).toBe('2026-27');
    expect(getBook('ka-kerc', book.financialYear).bookId).toBe('ka-kerc');
    expect(getBookHistory('ka-kerc').length).toBeGreaterThanOrEqual(1);
    expect(getUtility('bescom').utility.shortName).toBe('BESCOM');
    expect(getSolarResource('mangaluru').stateCode).toBe('KA');
  });

  it('fails loudly for unknown utilities, dates and locations', () => {
    expect(() => getTariff('nope')).toThrow(TariffLookupError);
    expect(() => getTariff('mescom', '2001-01-01')).toThrow(/No tariff/);
    expect(() => getBook('ka-kerc', '1999-00')).toThrow(TariffLookupError);
    expect(() => getSolarResource('atlantis')).toThrow(TariffLookupError);
  });
});

describe('schema integrity rules', () => {
  const clone = () => structuredClone(fixture) as unknown as Record<string, unknown> & typeof fixture;

  it('accepts the engine fixture', () => {
    expect(validateBook(fixture).ok).toBe(true);
  });

  it('rejects citations to unknown sources', () => {
    const book = clone();
    book.order = { ...book.order, cite: [{ ref: 'missing' }] };
    const result = validateBook(book);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('"missing"');
  });

  it('rejects non-http source URLs', () => {
    const book = clone();
    book.sources = { order: { ...fixture.sources.order!, url: 'javascript:alert(1)' } };
    expect(validateBook(book).ok).toBe(false);
  });

  it('rejects percentage charges that refer to later lines', () => {
    const book = clone();
    const category = book.categories[0]!;
    book.categories = [{ ...category, charges: [...category.charges].reverse() }];
    const result = validateBook(book);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('earlier charge');
  });

  it('rejects slabs that are not ascending or open-ended', () => {
    const book = clone();
    const category = book.categories[0]!;
    book.categories = [
      { ...category, energy: { ...category.energy, schedules: [{ id: 'bad', method: 'telescopic', slabs: [{ upTo: 100, rate: 1 }, { upTo: 50, rate: 2 }] }] } },
    ];
    const result = validateBook(book);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/ascending|open-ended/);
  });

  it('rejects a book without exactly one default solar regime', () => {
    const book = clone();
    book.rooftopSolar = { ...book.rooftopSolar, regimes: book.rooftopSolar.regimes.map((r) => ({ ...r, default: false })) };
    expect(validateBook(book).ok).toBe(false);
  });

  it('rejects malformed financial years', () => {
    expect(validateBook({ ...fixture, financialYear: '2026-28' }).ok).toBe(false);
  });
});
