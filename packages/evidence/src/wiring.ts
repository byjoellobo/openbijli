/**
 * Connects the evidence engine to the bundled Open Tariff India data and bill engine.
 * Kept separate so the analysis code stays pure and testable with any tariff source.
 */
import { catalog, getTariff, type ConsumerProtectionItem, type TariffBook } from '@open-tariff-india/data';
import { computeBill } from '@open-tariff-india/engine';
import type { TariffComputer } from './analysis/reconcile.js';
import type { CaseFile } from './case.js';
import type { RightsItem } from './report/build.js';

const DAYS_PER_MONTH = 365.25 / 12;
/** Pro-rate only when a period is more than 10% longer or shorter than a billing cycle. */
const PRORATE_THRESHOLD = 0.1;

/**
 * Price units with the tariff in force on the period's start date (IST). For periods that
 * differ from the billing cycle, slabs and fixed charges are pro-rated on days: the units
 * are scaled to a cycle-equivalent, billed, and the result scaled back.
 */
export function tariffComputerFor(caseFile: CaseFile): TariffComputer {
  return (units, onDateIso, periodDays) => {
    const istDay = new Date(Date.parse(onDateIso) + 330 * 60_000).toISOString().slice(0, 10);
    const book = getTariff(caseFile.utilityId, istDay);
    const cycleDays = (book.categories[0]?.billingCycle === 'bimonthly' ? 2 : 1) * DAYS_PER_MONTH;
    const scale = periodDays !== undefined && Math.abs(periodDays / cycleDays - 1) > PRORATE_THRESHOLD ? periodDays / cycleDays : 1;
    const bill = computeBill(book, {
      utilityId: caseFile.utilityId,
      units: units / scale,
      sanctionedLoadKw: caseFile.sanctionedLoadKw,
      ...(caseFile.phase ? { phase: caseFile.phase } : {}),
      ...(caseFile.area ? { area: caseFile.area } : {}),
      flags: caseFile.meter.type === 'prepaid' ? ['prepaid', 'smart_meter'] : [],
    });
    const label = `${book.regulator.short} tariff ${book.financialYear}`;
    return {
      total: bill.total * scale,
      fixed: bill.totals.fixed * scale,
      label: scale === 1 ? label : `${label}, pro-rated to ${periodDays?.toFixed(1)} days`,
    };
  };
}

function toRights(items: readonly ConsumerProtectionItem[], sources: TariffBook['sources']): RightsItem[] {
  return items.map((item) => {
    const source = item.cite[0] ? sources[item.cite[0].ref] : undefined;
    return {
      topic: item.topic,
      summary: item.summary,
      ...(source ? { sourceTitle: source.title, sourceUrl: source.url } : {}),
    };
  });
}

/** Utility-specific consumer protections from the tariff book, then national rules. */
export function rightsFor(utilityId: string): RightsItem[] {
  const book = getTariff(utilityId);
  return [
    ...toRights(book.consumerProtection ?? [], book.sources),
    ...toRights(catalog.national.consumerRights, catalog.national.sources),
  ];
}
