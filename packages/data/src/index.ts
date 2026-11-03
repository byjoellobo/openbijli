/**
 * @openbijli/data
 *
 * The bundled, validated tariff catalog plus lookup helpers. Schemas and validation
 * live in the "@openbijli/data/schema" entry point so that browser bundles
 * that only read data do not ship zod.
 */
import { catalog as bundled } from './generated/catalog.js';
import {
  bookByFy,
  bookFor,
  booksById,
  findUtility,
  listUtilities,
  solarResource,
  solarResourceForUtility,
} from './catalog.js';
import type { Catalog, SolarResource, TariffBook, UtilitySummary } from './types.js';

export type * from './types.js';
export { TariffLookupError } from './catalog.js';
export * as lookup from './catalog.js';

export const catalog: Catalog = bundled;

export function getTariff(utilityId: string, onDate?: string): TariffBook {
  return bookFor(catalog, utilityId, onDate);
}

export function getBook(bookId: string, financialYear: string): TariffBook {
  return bookByFy(catalog, bookId, financialYear);
}

export function getBookHistory(bookId: string): TariffBook[] {
  return booksById(catalog, bookId);
}

export function getUtilities(): UtilitySummary[] {
  return listUtilities(catalog);
}

export function getUtility(utilityId: string): ReturnType<typeof findUtility> {
  return findUtility(catalog, utilityId);
}

export function getSolarResource(id: string): SolarResource {
  return solarResource(catalog, id);
}

export function getSolarResourceForUtility(utilityId: string): SolarResource {
  return solarResourceForUtility(catalog, utilityId);
}
