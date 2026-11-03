import { describe, expect, it } from 'vitest';
import {
  cosZenith,
  hourlyGenerationShape,
  inWindow,
  installedCost,
  irr,
  monthBalance,
  npv,
  paybackYears,
  regimesForCapacity,
  resolveAssumptions,
  resolveLoadProfile,
  simulateSolar,
  tieredSubsidy,
  todPeriodForHour,
} from '../src/index.js';
import { book, centralSubsidy, domestic, resource } from './fixtures.js';

describe('finance helpers', () => {
  const flows = [-1000, 300, 300, 300, 300, 300];

  it('computes NPV, IRR and payback', () => {
    expect(npv(0.1, flows)).toBeCloseTo(137.24, 2);
    expect(irr(flows)).toBeCloseTo(0.1524, 4);
    expect(paybackYears(flows)).toBeCloseTo(3.3333, 4);
    expect(paybackYears([-1000, 10, 10])).toBeNull();
    expect(paybackYears([0, 10])).toBe(0);
    // An inverter replacement that pushes the cumulative back below zero delays payback.
    expect(paybackYears([-1000, 600, 600, -500, 600])).toBeCloseTo(3 + 300 / 600, 6);
    expect(irr([100, 100])).toBeNull();
  });

  it('applies PM Surya Ghar style tiered subsidy with cap', () => {
    expect(tieredSubsidy(centralSubsidy.tiers, 1)).toBe(30000);
    expect(tieredSubsidy(centralSubsidy.tiers, 2)).toBe(60000);
    expect(tieredSubsidy(centralSubsidy.tiers, 2.5)).toBe(69000);
    expect(tieredSubsidy(centralSubsidy.tiers, 3, 78000)).toBe(78000);
    expect(tieredSubsidy(centralSubsidy.tiers, 6, 78000)).toBe(78000);
  });

  it('prices installed cost by size band', () => {
    const bands = [
      { upToKw: 3, inrPerKw: 60000 },
      { upToKw: null, inrPerKw: 52000 },
    ];
    expect(installedCost(bands, 2)).toBe(120000);
    expect(installedCost(bands, 5)).toBe(284000); // 3 x 60k + 2 x 52k, tiers are cumulative
    expect(() => installedCost([], 1)).toThrow(RangeError);
  });
});

describe('solar geometry and profiles', () => {
  it('produces a daylight-only shape that sums to 1 and peaks after 12:00 IST in western India', () => {
    const shape = hourlyGenerationShape(12.87, 74.88, 0);
    expect(shape.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(shape[0]).toBe(0);
    expect(shape[23]).toBe(0);
    const peakHour = shape.indexOf(Math.max(...shape));
    expect(peakHour).toBe(12); // solar noon ~12:40 IST in Mangaluru in January
  });

  it('has the sun below the horizon at midnight', () => {
    expect(cosZenith(28.6, 77.2, 172, 0)).toBeLessThan(0);
    expect(() => hourlyGenerationShape(10, 77, 12)).toThrow(RangeError);
  });

  it('normalises custom load profiles and rejects bad ones', () => {
    const custom = resolveLoadProfile(Array.from({ length: 24 }, (_, h) => (h < 12 ? 1 : 3)));
    expect(custom.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(() => resolveLoadProfile([1, 2])).toThrow(RangeError);
    expect(() => resolveLoadProfile(Array.from({ length: 24 }, () => 0))).toThrow(RangeError);
    expect(resolveLoadProfile('flat')[5]).toBeCloseTo(1 / 24, 9);
  });

  it('maps clock hours to ToD periods, including windows that wrap midnight', () => {
    const tod = domestic.tod;
    if (!tod) throw new Error('fixture has ToD');
    expect(todPeriodForHour(tod, 10)).toBe('solar');
    expect(todPeriodForHour(tod, 19)).toBe('peak');
    expect(todPeriodForHour(tod, 3)).toBeNull();
    expect(inWindow(23 * 60, { from: '22:00', to: '06:00' })).toBe(true);
    expect(inWindow(7 * 60, { from: '22:00', to: '06:00' })).toBe(false);
  });
});

describe('monthBalance', () => {
  it('conserves energy: load = self + import, generation = self + export', () => {
    const balance = monthBalance({
      consumptionKwh: 300,
      days: 30,
      sizeKw: 3,
      dailyYieldPerKwp: 4,
      generationShape: hourlyGenerationShape(13, 77, 3),
      loadShape: resolveLoadProfile('evening_peak'),
    });
    expect(balance.generation).toBeCloseTo(360, 6);
    expect(balance.selfConsumed + balance.imported).toBeCloseTo(300, 6);
    expect(balance.selfConsumed + balance.exported).toBeCloseTo(360, 6);
    expect(balance.importedByHour.reduce((a, b) => a + b, 0)).toBeCloseTo(balance.imported, 6);
  });
});

describe('simulateSolar', () => {
  const base = {
    book,
    resource,
    utilityId: 'util-b',
    sanctionedLoadKw: 5,
    monthlyConsumptionKwh: Array.from({ length: 12 }, () => 400),
    installedCostTiers: [{ upToKw: null, inrPerKw: 55000 }],
    centralSubsidy,
  } as const;

  it('generates the expected year-one energy for 1 kW', () => {
    const result = simulateSolar({ ...base, sizesKw: [1] });
    const size = result.sizes[0];
    expect(size?.year1?.generation).toBeCloseTo(5 * 0.75 * 365, 3);
  });

  it('limits sizes to the regulatory share of sanctioned load', () => {
    const result = simulateSolar({ ...base, sanctionedLoadKw: 3 });
    expect(result.maxFeasibleKw).toBe(3);
    expect(result.sizes.map((s) => s.sizeKw)).toEqual([1, 2, 3]);
    const forced = simulateSolar({ ...base, sanctionedLoadKw: 3, sizesKw: [4] });
    expect(forced.sizes[0]?.feasible).toBe(false);
    expect(simulateSolar({ ...base, sanctionedLoadKw: 2.5 }).sizes.map((s) => s.sizeKw)).toEqual([1, 2, 2.5]);
    expect(simulateSolar({ ...base, sizesKw: [3, 1, 2] }).sizes.map((s) => s.sizeKw)).toEqual([1, 2, 3]);
  });

  it('nets subsidies from cost and recommends a size with positive NPV', () => {
    const result = simulateSolar(base);
    const three = result.sizes.find((s) => s.sizeKw === 3);
    expect(three?.grossCost).toBe(165000);
    expect(three?.centralSubsidy).toBe(78000);
    expect(three?.stateSubsidy).toBe(10000);
    expect(three?.netCost).toBe(77000);
    expect(result.recommended).not.toBeNull();
    expect(result.rationale.length).toBeGreaterThan(1);
    expect(result.recommended?.npv).toBeGreaterThan(0);
  });

  it('shows savings flattening once surplus is only paid the export rate', () => {
    const result = simulateSolar({ ...base, monthlyConsumptionKwh: Array.from({ length: 12 }, () => 150) });
    const values = result.sizes.map((s) => s.year1?.valuePerKwh ?? 0);
    expect(values[0]).toBeGreaterThan(values.at(-1) ?? Infinity);
    const big = result.sizes.at(-1);
    expect(big?.year1?.settledUnits).toBeGreaterThan(0);
  });

  it('recommends nothing when costs can never be recovered', () => {
    const result = simulateSolar({ ...base, costPerKw: 5_000_000, centralSubsidy: null });
    expect(result.recommended).toBeNull();
    expect(result.rationale.some((r) => r.includes('No size pays for itself'))).toBe(true);
  });

  it('bills bimonthly utilities in two-month cycles and warns about unapplied subsidies', () => {
    const bimonthly = { ...book, categories: [{ ...domestic, billingCycle: 'bimonthly' as const }] };
    const result = simulateSolar({ ...base, book: bimonthly, sizesKw: [2] });
    expect(result.sizes[0]?.year1?.cycles).toHaveLength(6);
    expect(result.sizes[0]?.year1?.cycles[0]?.label).toBe('Apr–May');
    const off = simulateSolar({ ...base, book: bimonthly, sizesKw: [2], billSubsidies: { apply: false } });
    expect(off.warnings.some((w) => w.includes('switched off'))).toBe(true);
  });

  it('bills ToD consumers with a time split derived from the profile', () => {
    const plain = simulateSolar({ ...base, sizesKw: [3] });
    const tod = simulateSolar({ ...base, sizesKw: [3], flags: ['smart_meter'] });
    expect(tod.annualBillWithout).not.toBe(plain.annualBillWithout);
  });

  it('validates inputs and assumptions', () => {
    expect(() => simulateSolar({ ...base, monthlyConsumptionKwh: [1, 2] })).toThrow(RangeError);
    expect(() => simulateSolar({ ...base, sizesKw: [0] })).toThrow(RangeError);
    expect(() => resolveAssumptions({ performanceRatio: 2 })).toThrow(RangeError);
    expect(() => resolveAssumptions({ years: 0 })).toThrow(RangeError);
  });

  it('lists regimes allowed for a size, default first', () => {
    expect(regimesForCapacity(book.rooftopSolar, 5).map((r) => r.id)).toEqual(['nm', 'nb']);
    expect(regimesForCapacity(book.rooftopSolar, 12).map((r) => r.id)).toEqual(['nb', 'gm']);
  });
});
