/**
 * Lookup helpers over a catalog. Pure functions so they work on the bundled
 * catalog or on a catalog a caller assembled (for example while reviewing a PR).
 */
import type { Catalog, SolarResource, TariffBook, Utility, UtilitySummary } from './types.js';

export class TariffLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TariffLookupError';
  }
}

function compareFy(a: TariffBook, b: TariffBook): number {
  return a.effectiveFrom.localeCompare(b.effectiveFrom);
}

/** All books for one bookId, oldest first. */
export function booksById(catalog: Catalog, bookId: string): TariffBook[] {
  return catalog.books.filter((b) => b.bookId === bookId).toSorted(compareFy);
}

export function findUtility(catalog: Catalog, utilityId: string): { utility: Utility; books: TariffBook[] } {
  const books = catalog.books.filter((b) => b.utilities.some((u) => u.id === utilityId)).toSorted(compareFy);
  const latest = books.at(-1);
  const utility = latest?.utilities.find((u) => u.id === utilityId);
  if (!latest || !utility) {
    throw new TariffLookupError(`Unknown utility "${utilityId}". Known: ${listUtilities(catalog).map((u) => u.id).join(', ')}`);
  }
  return { utility, books };
}

/**
 * The tariff book in force for a utility on a date (YYYY-MM-DD). Falls back to the
 * latest book when the date is after every effectiveFrom, and throws when the date is
 * before the earliest book we hold.
 */
export function bookFor(catalog: Catalog, utilityId: string, onDate?: string): TariffBook {
  const { books } = findUtility(catalog, utilityId);
  if (onDate === undefined) return books.at(-1) as TariffBook;
  const candidates = books.filter((b) => b.effectiveFrom <= onDate);
  const book = candidates.at(-1);
  if (!book) {
    throw new TariffLookupError(`No tariff for ${utilityId} on ${onDate}; earliest held is ${books[0]?.effectiveFrom}`);
  }
  return book;
}

export function bookByFy(catalog: Catalog, bookId: string, financialYear: string): TariffBook {
  const book = catalog.books.find((b) => b.bookId === bookId && b.financialYear === financialYear);
  if (!book) throw new TariffLookupError(`No book ${bookId} for FY ${financialYear}`);
  return book;
}

export function listUtilities(catalog: Catalog): UtilitySummary[] {
  const latestByUtility = new Map<string, { utility: Utility; book: TariffBook }>();
  for (const book of catalog.books) {
    for (const utility of book.utilities) {
      const current = latestByUtility.get(utility.id);
      if (!current || current.book.effectiveFrom < book.effectiveFrom) {
        latestByUtility.set(utility.id, { utility, book });
      }
    }
  }
  return [...latestByUtility.values()]
    .map(({ utility, book }) => ({
      id: utility.id,
      name: utility.name,
      shortName: utility.shortName,
      state: book.state,
      stateCode: book.stateCode,
      bookId: book.bookId,
      regulator: book.regulator.short,
      latestFinancialYear: book.financialYear,
    }))
    .toSorted((a, b) => a.state.localeCompare(b.state) || a.shortName.localeCompare(b.shortName));
}

export function solarResource(catalog: Catalog, id: string): SolarResource {
  const location = catalog.solar.locations.find((l) => l.id === id);
  if (!location) throw new TariffLookupError(`Unknown solar resource location "${id}"`);
  return location;
}

export function solarResourceForUtility(catalog: Catalog, utilityId: string): SolarResource {
  return solarResource(catalog, findUtility(catalog, utilityId).utility.solarResource);
}
