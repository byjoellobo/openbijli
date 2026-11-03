import type { Subsidy } from '@openbijli/data';
import type { SubsidyOptions } from './types.js';

export interface CoreTotals {
  readonly energy: number;
  readonly fixed: number;
  readonly tod: number;
  readonly charges: number;
}

export type Covers = 'total' | 'energy' | 'energy_and_fixed';

export function coveredAmount(totals: CoreTotals, covers: Covers): number {
  switch (covers) {
    case 'energy':
      return totals.energy + totals.tod;
    case 'energy_and_fixed':
      return totals.energy + totals.tod + totals.fixed;
    default:
      return totals.energy + totals.tod + totals.fixed + totals.charges;
  }
}

export interface SubsidyEnv {
  readonly billedUnits: number;
  readonly totals: CoreTotals;
  readonly options: SubsidyOptions;
  /** Pre-subsidy totals of a counterfactual bill for fewer units (no ToD, no solar). */
  readonly totalsFor: (units: number) => CoreTotals;
  /** Energy charge of the first N units at the bill's schedule rates. */
  readonly energyForFirst: (units: number) => number;
  /** Energy charge for the billed units under alternative schedules. */
  readonly energyAt: (schedules: Extract<Subsidy, { rule: 'payable_schedule' }>['schedules']) => number;
}

export interface SubsidyCredit {
  readonly subsidy: Subsidy;
  /** Positive number: the amount the scheme pays. */
  readonly credit: number;
  readonly detail: string;
  readonly warning?: string;
}

/** Evaluate one scheme. Returns null when it does not apply to this bill. */
export function evaluateSubsidy(subsidy: Subsidy, env: SubsidyEnv): SubsidyCredit | null {
  const units = env.billedUnits;
  switch (subsidy.rule) {
    case 'zero_bill_up_to': {
      if (units > subsidy.thresholdUnits) return null;
      return {
        subsidy,
        credit: coveredAmount(env.totals, subsidy.covers),
        detail: `${units} kWh ≤ ${subsidy.thresholdUnits} kWh threshold: ${subsidy.covers} covered`,
      };
    }
    case 'free_units': {
      const free = Math.min(units, subsidy.units);
      if (free <= 0) return null;
      return { subsidy, credit: env.energyForFirst(free), detail: `first ${free} kWh free at slab rates` };
    }
    case 'percent_band': {
      if (!(units > subsidy.aboveUnits && units <= subsidy.upToUnits)) return null;
      const raw = (coveredAmount(env.totals, subsidy.covers) * subsidy.percent) / 100;
      const credit = subsidy.capAmount === undefined ? raw : Math.min(raw, subsidy.capAmount);
      const capped = subsidy.capAmount !== undefined && raw > subsidy.capAmount ? ` (capped at ₹${subsidy.capAmount})` : '';
      return { subsidy, credit, detail: `${subsidy.percent}% of ${subsidy.covers}${capped}` };
    }
    case 'payable_schedule': {
      const payable = env.energyAt(subsidy.schedules);
      const credit = env.totals.energy - payable;
      if (credit <= 0) return null;
      return { subsidy, credit, detail: `consumer pays ₹${payable.toFixed(2)} energy charge instead of ₹${env.totals.energy.toFixed(2)}` };
    }
    case 'entitlement': {
      if (subsidy.fullBillAboveUnits !== undefined && units > subsidy.fullBillAboveUnits) return null;
      const baseline = env.options.baselineUnits;
      if (baseline === undefined) {
        return {
          subsidy,
          credit: 0,
          detail: 'not applied',
          warning: `${subsidy.name} needs the household's baseline consumption (subsidies.baselineUnits); not applied.`,
        };
      }
      const entitlement = Math.min(subsidy.capUnits, Math.round(baseline * subsidy.baselineMultiplier));
      const covered = coveredAmount(env.totals, subsidy.covers);
      if (units <= entitlement) {
        return { subsidy, credit: covered, detail: `${units} kWh within entitlement of ${entitlement} kWh` };
      }
      if (subsidy.excessBilling === 'full_bill') return null;
      const excessCovered = coveredAmount(env.totalsFor(units - entitlement), subsidy.covers);
      return {
        subsidy,
        credit: Math.max(0, covered - excessCovered),
        detail: `entitlement ${entitlement} kWh; billed for the ${units - entitlement} kWh above it`,
      };
    }
  }
}
