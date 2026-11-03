import { catalog, getTariff, getUtilities, type TariffBook, type UtilitySummary } from '@open-tariff-india/data';

export const utilities: readonly UtilitySummary[] = getUtilities();

export const utilitiesByState: readonly { state: string; items: UtilitySummary[] }[] = [...new Set(utilities.map((u) => u.state))].map(
  (state) => ({ state, items: utilities.filter((u) => u.state === state) }),
);

export const DEFAULT_UTILITY = utilities.some((u) => u.id === 'mescom') ? 'mescom' : (utilities[0]?.id ?? '');

export function bookFor(utilityId: string): TariffBook {
  return getTariff(utilityId);
}

export const marketCostPerKw: number = catalog.national.assumptions.find((a) => a.id === 'market-cost-per-kw')?.value ?? 62500;

export const centralSubsidy = catalog.national.centralSubsidies.find((s) => s.id === 'pm-surya-ghar') ?? null;

export function cycleWord(book: TariffBook): string {
  return book.categories[0]?.billingCycle === 'bimonthly' ? 'two months' : 'month';
}
