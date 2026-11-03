import type { Citation, Condition, TariffBook } from '@openbijli/data';
import type { BillContext, ResolvedCitation } from './types.js';

/** True when every constraint present in the condition holds for the context. */
export function matchesCondition(condition: Condition | undefined, ctx: BillContext): boolean {
  if (!condition) return true;
  if (condition.phase !== undefined && condition.phase !== ctx.phase) return false;
  if (condition.area !== undefined && condition.area !== ctx.area) return false;
  if (condition.minLoadKw !== undefined && ctx.loadKw < condition.minLoadKw) return false;
  if (condition.maxLoadKw !== undefined && ctx.loadKw > condition.maxLoadKw) return false;
  if (condition.flags?.some((flag) => !ctx.flags.has(flag))) return false;
  return true;
}

export function resolveCitations(book: TariffBook, cites: readonly Citation[]): ResolvedCitation[] {
  return cites.map((cite) => {
    const source = book.sources[cite.ref];
    if (!source) {
      // Validation guarantees this never happens for catalog data; guard for hand-built books.
      return { ref: cite.ref, title: `Unknown source ${cite.ref}`, publisher: 'unknown', url: '' };
    }
    return {
      ref: cite.ref,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      ...(cite.page !== undefined ? { page: cite.page } : {}),
      ...(cite.quote !== undefined ? { quote: cite.quote } : {}),
    };
  });
}
