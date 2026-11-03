import type { FixedChargeRule } from '@open-tariff-india/data';
import { matchesCondition } from './context.js';
import { TariffDataError } from './energy.js';
import type { BillContext } from './types.js';

export interface FixedChargeResult {
  readonly rule: FixedChargeRule;
  readonly amount: number;
  readonly billedLoadKw: number;
  readonly detail: string;
}

export function roundLoad(kw: number, rounding: FixedChargeRule['loadRounding']): number {
  // Small epsilon so 3.0000000001 (float noise) does not round up to 4.
  switch (rounding) {
    case 'ceil':
      return Math.ceil(kw - 1e-9);
    case 'ceil_half':
      return Math.ceil(kw * 2 - 1e-9) / 2;
    case 'round_quarter':
      return Math.round(kw * 4) / 4;
    default:
      return kw;
  }
}

export function selectFixedRule(rules: readonly FixedChargeRule[], ctx: BillContext): FixedChargeRule {
  const rule = rules.find((r) => matchesCondition(r.when, ctx));
  if (!rule) throw new TariffDataError(`No fixed-charge rule matches ${ctx.phase}-phase, ${ctx.loadKw} kW, ${ctx.area}`);
  return rule;
}

function bandFor<T extends { upTo: number | null }>(bands: readonly T[], value: number): T {
  const band = bands.find((b) => b.upTo === null || value <= b.upTo) ?? bands.at(-1);
  if (!band) throw new TariffDataError('Fixed-charge rule has no bands');
  return band;
}

/** Monthly amount for the rule before multiplying by months in the cycle. */
function monthlyOrCycleAmount(rule: FixedChargeRule, load: number, cycleUnits: number, monthsInCycle: number): { amount: number; detail: string } {
  if (rule.bandBy === 'load_kw' && rule.method === 'telescopic') {
    let lower = 0;
    let amount = 0;
    const parts: string[] = [];
    for (const band of rule.bands) {
      const upper = band.upTo ?? Number.POSITIVE_INFINITY;
      const kwInBand = Math.min(load, upper) - lower;
      if (kwInBand > 0) {
        const part = band.per === 'kw' ? kwInBand * band.amount : band.amount;
        amount += part;
        parts.push(band.per === 'kw' ? `${kwInBand} kW × ₹${band.amount}` : `₹${band.amount}`);
      }
      if (load <= upper) break;
      lower = upper;
    }
    return { amount, detail: parts.join(' + ') };
  }

  let band: FixedChargeRule['bands'][number];
  if (rule.bandBy === 'none') {
    band = rule.bands[0] as FixedChargeRule['bands'][number];
  } else if (rule.bandBy === 'load_kw') {
    band = bandFor(rule.bands, load);
  } else {
    const basis = rule.unitsBasis === 'monthly_average' ? cycleUnits / monthsInCycle : cycleUnits;
    band = bandFor(rule.bands, basis);
  }
  return band.per === 'kw'
    ? { amount: band.amount * load, detail: `${load} kW × ₹${band.amount}` }
    : { amount: band.amount, detail: `₹${band.amount} per connection` };
}

export function computeFixed(
  rule: FixedChargeRule,
  ctx: BillContext,
  cycleUnits: number,
  monthsInCycle: number,
): FixedChargeResult {
  const load = Math.max(rule.minimumKw ?? 0, roundLoad(ctx.loadKw, rule.loadRounding));
  const { amount, detail } = monthlyOrCycleAmount(rule, load, cycleUnits, monthsInCycle);
  const multiplier = rule.period === 'month' ? monthsInCycle : 1;
  return {
    rule,
    amount: amount * multiplier,
    billedLoadKw: load,
    detail: multiplier > 1 ? `(${detail}) × ${multiplier} months` : detail,
  };
}
