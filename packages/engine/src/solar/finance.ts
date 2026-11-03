/** Cash-flow helpers. Index 0 is the upfront (year 0) flow. */

export function npv(rate: number, cashflows: readonly number[]): number {
  return cashflows.reduce((total, cf, year) => total + cf / (1 + rate) ** year, 0);
}

/** Internal rate of return by bisection; null when the flows never change sign. */
export function irr(cashflows: readonly number[], low = -0.99, high = 1.5): number | null {
  let fLow = npv(low, cashflows);
  const fHigh = npv(high, cashflows);
  if (Number.isNaN(fLow) || Number.isNaN(fHigh) || fLow * fHigh > 0) return null;
  let lo = low;
  let hi = high;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < 1e-6 || hi - lo < 1e-9) return mid;
    if (fLow * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLow = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Years until cumulative (optionally discounted) cash flow turns non-negative for good,
 * interpolated. A later dip below zero (an inverter replacement) moves payback past it.
 */
export function paybackYears(cashflows: readonly number[], discountRate = 0): number | null {
  const cumulative: number[] = [];
  let running = 0;
  cashflows.forEach((cf, year) => {
    running += cf / (1 + discountRate) ** year;
    cumulative.push(running);
  });
  if (cumulative.length === 0 || (cumulative.at(-1) ?? -1) < 0) return null;
  let lastNegative = -1;
  cumulative.forEach((value, year) => {
    if (value < 0) lastNegative = year;
  });
  if (lastNegative < 0) return 0;
  const before = cumulative[lastNegative] ?? 0;
  const after = cumulative[lastNegative + 1] ?? 0;
  return lastNegative + -before / (after - before);
}

/** Tiered per-kW subsidy (PM Surya Ghar style): each kW band earns its own rate. */
export function tieredSubsidy(
  tiers: readonly { upToKw: number | null; perKw: number }[],
  sizeKw: number,
  capInr?: number,
): number {
  let lower = 0;
  let total = 0;
  for (const tier of tiers) {
    const upper = tier.upToKw ?? Number.POSITIVE_INFINITY;
    const kw = Math.min(sizeKw, upper) - lower;
    if (kw > 0) total += kw * tier.perKw;
    if (sizeKw <= upper) break;
    lower = upper;
  }
  return capInr === undefined ? total : Math.min(total, capInr);
}

/** Installed cost from cumulative per-kW tiers (MNRE benchmark style: first 2 kW at one rate, the rest at another). */
export function installedCost(tiers: readonly { upToKw: number | null; inrPerKw: number }[], sizeKw: number): number {
  if (tiers.length === 0) throw new RangeError('installed cost needs at least one tier');
  return tieredSubsidy(
    tiers.map((t) => ({ upToKw: t.upToKw, perKw: t.inrPerKw })),
    sizeKw,
  );
}
