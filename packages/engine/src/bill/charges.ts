import type { AdditionalCharge } from '@openbijli/data';
import { matchesCondition } from './context.js';
import type { BillContext } from './types.js';

export interface SolarChargeInput {
  readonly capacityKw: number;
  readonly generatedUnits?: number;
}

export interface ChargeResult {
  readonly charge: AdditionalCharge;
  readonly amount: number;
  readonly detail: string;
}

/**
 * Evaluate additional charges in file order. Percentage charges read the running
 * totals of earlier lines, so "duty on (energy + fixed + FPPCA)" works as long as
 * FPPCA appears before the duty in the data file.
 */
export function computeCharges(
  charges: readonly AdditionalCharge[],
  ctx: BillContext,
  utilityId: string,
  baseTotals: Readonly<Record<'energy' | 'fixed' | 'tod', number>>,
  billedUnits: number,
  monthsInCycle: number,
  solar: SolarChargeInput = { capacityKw: 0 },
): ChargeResult[] {
  const solarCapacityKw = solar.capacityKw;
  const running = new Map<string, number>(Object.entries(baseTotals));
  const results: ChargeResult[] = [];

  for (const charge of charges) {
    if (charge.utilities && !charge.utilities.includes(utilityId)) continue;
    if (!matchesCondition(charge.appliesIf, ctx)) continue;
    const range = charge.whenUnits;
    if (range?.aboveUnits !== undefined && !(billedUnits > range.aboveUnits)) continue;
    if (range?.upToUnits !== undefined && billedUnits > range.upToUnits) continue;

    let amount: number;
    let detail: string;
    switch (charge.kind) {
      case 'per_kwh':
        amount = charge.rate * billedUnits;
        detail = `${round3(billedUnits)} kWh × ₹${charge.rate}`;
        break;
      case 'percent': {
        const base = charge.of.reduce((total, id) => total + (running.get(id) ?? 0), 0);
        amount = (base * charge.percent) / 100;
        detail = `${charge.percent}% of ${charge.of.join(' + ')} (₹${base.toFixed(2)})`;
        break;
      }
      case 'flat': {
        const multiplier = charge.period === 'month' ? monthsInCycle : 1;
        amount = charge.amount * multiplier;
        detail = multiplier > 1 ? `₹${charge.amount} × ${multiplier} months` : `₹${charge.amount}`;
        break;
      }
      case 'per_solar_kw': {
        const kw = Math.min(solarCapacityKw, charge.maxKw ?? Number.POSITIVE_INFINITY);
        if (kw <= 0) continue;
        const multiplier = charge.period === 'month' ? monthsInCycle : 1;
        amount = charge.amount * kw * multiplier;
        detail = `${kw} kW solar × ₹${charge.amount}${multiplier > 1 ? ` × ${multiplier} months` : ''}`;
        break;
      }
      case 'flat_by_units': {
        const basis = charge.unitsBasis === 'monthly_average' ? billedUnits / monthsInCycle : billedUnits;
        const band = charge.bands.find((b) => b.upTo === null || basis <= b.upTo) ?? charge.bands.at(-1);
        if (!band) continue;
        const multiplier = charge.period === 'month' ? monthsInCycle : 1;
        amount = band.amount * multiplier;
        detail = `₹${band.amount}${multiplier > 1 ? ` × ${multiplier} months` : ''} (band up to ${band.upTo ?? 'any'} kWh)`;
        break;
      }
      case 'per_solar_kwh': {
        const inBand =
          solarCapacityKw > (charge.minSolarKw ?? 0) + 1e-9 &&
          (charge.maxSolarKw === undefined || solarCapacityKw <= charge.maxSolarKw + 1e-9);
        if (solarCapacityKw <= 0 || !inBand || solar.generatedUnits === undefined) continue;
        amount = charge.rate * solar.generatedUnits;
        detail = `${round3(solar.generatedUnits)} kWh generated × ₹${charge.rate}`;
        break;
      }
    }
    running.set(charge.id, amount);
    results.push({ charge, amount, detail });
  }
  return results;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
