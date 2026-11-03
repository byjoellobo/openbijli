import type { Tod, TodPeriod } from '@open-tariff-india/data';
import { matchesCondition } from './context.js';
import type { BillContext } from './types.js';

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Window [from, to) in minutes of the day; wraps midnight when from > to. */
export function inWindow(minute: number, window: { from: string; to: string }): boolean {
  const from = minutesOf(window.from);
  const to = minutesOf(window.to);
  if (from === to) return true;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

export function todPeriodAt(tod: Tod, minuteOfDay: number): TodPeriod | undefined {
  return tod.periods.find((p) => p.windows.some((w) => inWindow(minuteOfDay, w)));
}

/** ToD period id for a clock hour (evaluated at the hour's midpoint), or null for normal hours. */
export function todPeriodForHour(tod: Tod, hour: number): string | null {
  return todPeriodAt(tod, hour * 60 + 30)?.id ?? null;
}

export type TodDecision =
  | { readonly apply: true }
  | { readonly apply: false; readonly warning?: string };

export function decideTod(
  tod: Tod | undefined,
  ctx: BillContext,
  todUnits: Readonly<Record<string, number>> | undefined,
  billedUnits: number,
): TodDecision {
  if (!tod) {
    return todUnits ? { apply: false, warning: 'A ToD split was given but this category has no ToD tariff; billed at normal rates.' } : { apply: false };
  }
  if (tod.aboveUnits !== undefined && billedUnits <= tod.aboveUnits) return { apply: false };
  const eligible = matchesCondition(tod.appliesIf, ctx);
  if (!todUnits) {
    return tod.mandatory && eligible
      ? { apply: false, warning: `ToD applies to this consumer (${tod.applicability}) but no time-of-day split was given; billed at normal rates.` }
      : { apply: false };
  }
  if (!eligible) {
    return { apply: false, warning: `ToD split ignored: ${tod.applicability}` };
  }
  return { apply: true };
}

export interface TodCharge {
  readonly period: TodPeriod;
  readonly units: number;
  readonly ratePerKwh: number;
  readonly amount: number;
}

/**
 * Price ToD adjustments. Percentage adjustments apply to the average energy rate of
 * the bill (energy charge / billed units), which is how a "normal tariff" baseline is
 * read when slabs make the rate consumption-dependent. `scale` shrinks the split when
 * net metering bills fewer units than were imported.
 */
export function priceTod(
  tod: Tod,
  todUnits: Readonly<Record<string, number>>,
  averageEnergyRate: number,
  scale: number,
): TodCharge[] {
  return tod.periods.flatMap((period) => {
    const units = (todUnits[period.id] ?? 0) * scale;
    if (units <= 0) return [];
    const ratePerKwh =
      period.adjustment.type === 'percent_of_energy_rate'
        ? (averageEnergyRate * period.adjustment.value) / 100
        : period.adjustment.value;
    return [{ period, units, ratePerKwh, amount: units * ratePerKwh }];
  });
}
