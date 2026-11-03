import { toEpochMinute, type LedgerEntry } from '../case.js';
import { istDate } from '../log/format.js';
import { pct, rupees, type Finding } from './findings.js';
import type { TariffComputer } from './reconcile.js';
import type { LogIndex } from './series.js';

export interface PrepaidDay {
  readonly date: string;
  readonly kwh: number;
  readonly coverage: number;
  readonly deducted: number;
  readonly expected: number;
}

export interface PrepaidAudit {
  readonly days: readonly PrepaidDay[];
  readonly deducted: number;
  readonly expected: number;
  readonly recharged: number;
  readonly difference: number;
  readonly differencePct: number | null;
  readonly findings: readonly Finding[];
}

const DAYS_IN_MONTH = (yearMonth: string): number => {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
};

/**
 * Compare daily prepaid deductions with what the tariff implies for the logged
 * consumption. Each calendar month is priced as a whole (slabs depend on the month's
 * total, extrapolated from logged days), then spread over days by kWh, with the fixed
 * charge spread evenly per day.
 */
export function auditPrepaid(index: LogIndex, ledger: readonly LedgerEntry[], billFor: TariffComputer): PrepaidAudit {
  const daily = index.daily();
  const byMonth = new Map<string, { kwh: number; days: number }>();
  for (const day of daily) {
    const month = day.date.slice(0, 7);
    const entry = byMonth.get(month) ?? { kwh: 0, days: 0 };
    byMonth.set(month, { kwh: entry.kwh + day.kwh, days: entry.days + day.coverage });
  }

  const pricing = new Map<string, { variablePerKwh: number; fixedPerDay: number }>();
  for (const [month, { kwh, days }] of byMonth) {
    const monthDays = DAYS_IN_MONTH(month);
    const projected = days > 0 ? (kwh / days) * monthDays : 0;
    // periodDays: a calendar month, so bimonthly tariffs are pro-rated rather than doubled.
    const bill = billFor(projected, `${month}-01T00:00:00+05:30`, monthDays);
    if (!bill) continue;
    pricing.set(month, {
      variablePerKwh: projected > 0 ? (bill.total - bill.fixed) / projected : 0,
      fixedPerDay: bill.fixed / monthDays,
    });
  }

  const firstMinute = index.firstMinute;
  const lastMinute = index.lastMinute;
  const deductionsByDay = new Map<string, number>();
  let recharged = 0;
  for (const entry of ledger) {
    const minute = toEpochMinute(entry.timestamp);
    if (minute < firstMinute || minute > lastMinute) continue;
    if (entry.type === 'recharge') recharged += entry.amount;
    else {
      const date = istDate(minute);
      deductionsByDay.set(date, (deductionsByDay.get(date) ?? 0) + entry.amount);
    }
  }

  // Only days that are well logged and priced are compared, on both sides.
  const days: PrepaidDay[] = daily
    .filter((day) => day.coverage >= MIN_DAY_COVERAGE && pricing.has(day.date.slice(0, 7)))
    .map((day) => {
      const price = pricing.get(day.date.slice(0, 7));
      const expected = price ? day.kwh * price.variablePerKwh + price.fixedPerDay * Math.min(1, day.coverage) : 0;
      return { ...day, deducted: deductionsByDay.get(day.date) ?? 0, expected };
    });
  const skippedDays = daily.length - days.length;

  const deducted = days.reduce((s, d) => s + d.deducted, 0);
  const expected = days.reduce((s, d) => s + d.expected, 0);
  const difference = deducted - expected;
  return {
    days,
    deducted,
    expected,
    recharged,
    difference,
    differencePct: expected > 0 ? difference / expected : null,
    findings: prepaidFindings(days, deducted, expected, skippedDays, pricing.size === 0),
  };
}

/** Days logged for less than this share are left out of the prepaid comparison. */
const MIN_DAY_COVERAGE = 0.9;

function prepaidFindings(days: readonly PrepaidDay[], deducted: number, expected: number, skippedDays: number, unpriced: boolean): Finding[] {
  if (unpriced || (expected === 0 && deducted > 0)) {
    return [
      {
        id: 'prepaid',
        severity: 'low',
        title: 'Prepaid deductions could not be audited',
        summary: 'No tariff could be applied to the logged period, so deductions were not compared.',
        details: [],
      },
    ];
  }
  const skipped = skippedDays > 0 ? [`${skippedDays} day(s) logged for less than ${MIN_DAY_COVERAGE * 100}% of the day were left out of the comparison.`] : [];
  if (deducted === 0) {
    return [{ id: 'prepaid', severity: 'info', title: 'No prepaid deductions inside the logged period', summary: 'Add deduction entries from the utility app to audit them.', details: [] }];
  }
  const difference = deducted - expected;
  const share = expected > 0 ? difference / expected : 0;
  const outliers = days
    .filter((d) => d.deducted > d.expected * 1.5 + 10)
    .toSorted((a, b) => b.deducted - b.expected - (a.deducted - a.expected))
    .slice(0, 5)
    .map((d) => `${d.date}: deducted ${rupees(d.deducted)} for ${d.kwh.toFixed(2)} kWh (tariff implies ${rupees(d.expected)})`);
  if (difference > expected * 0.05 + 20) {
    return [
      {
        id: 'prepaid',
        severity: share > 0.15 ? 'high' : 'medium',
        title: `Prepaid deductions exceed the tariff by ${rupees(difference)} (${pct(share)})`,
        summary: `${rupees(deducted)} was deducted for consumption the published tariff prices at ${rupees(expected)}.`,
        details: [
          ...outliers,
          ...skipped,
          'Deductions can legitimately include arrears recovery or monthly adjustments; ask the utility for a component-wise statement.',
        ],
      },
    ];
  }
  return [
    {
      id: 'prepaid',
      severity: 'ok',
      title: 'Prepaid deductions are in line with the tariff',
      summary: `${rupees(deducted)} deducted vs ${rupees(expected)} expected for the logged consumption.`,
      details: [...outliers, ...skipped],
    },
  ];
}
