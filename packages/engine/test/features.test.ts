/**
 * Features added for specific state tariffs: Tamil Nadu's payable schedule and solar
 * network charge, Karnataka's subsidised export bands, quarter-kW load rounding and
 * solar fixed-charge rebate, Kerala's ToD threshold and banking charge.
 */
import { describe, expect, it } from 'vitest';
import type { Category, SolarRegime } from '@open-tariff-india/data';
import { computeBill, roundLoad, settleSolarCycle } from '../src/index.js';
import { exportRateFor } from '../src/bill/solar.js';
import { book, domestic, withCategory } from './fixtures.js';

const cite = [{ ref: 'order' }];
const noFixed: Category['fixed'] = {
  rules: [{ id: 'none', bandBy: 'none', method: 'whole', bands: [{ upTo: null, amount: 0, per: 'connection' }], period: 'month', loadRounding: 'none' }],
  cite,
  verification: 'verified',
};

describe('payable schedule subsidy (Tamil Nadu style)', () => {
  const tn = withCategory({
    billingCycle: 'bimonthly',
    energy: { ...domestic.energy, schedules: [{ id: 'approved', method: 'telescopic', slabs: [{ upTo: 400, rate: 4.95 }, { upTo: null, rate: 6.65 }] }] },
    fixed: noFixed,
    charges: [],
    tod: undefined,
    subsidies: [
      {
        rule: 'payable_schedule',
        id: 'tn-free-units',
        name: 'Free units',
        authority: 'Government of Tamil Nadu',
        optIn: false,
        eligibility: 'All domestic',
        schedules: [
          { id: 'upto-500', when: { upToUnits: 500 }, method: 'telescopic', slabs: [{ upTo: 200, rate: 0 }, { upTo: null, rate: 4.7 }] },
          { id: 'above-500', method: 'telescopic', slabs: [{ upTo: 100, rate: 0 }, { upTo: null, rate: 4.7 }] },
        ],
        cite,
        verification: 'verified',
      },
    ],
  });

  it('bills what the household pays by default', () => {
    const bill = computeBill(tn, { units: 300, sanctionedLoadKw: 2 });
    expect(bill.totals.energy).toBe(1485); // approved tariff
    expect(bill.totals.subsidies).toBe(-1015);
    expect(bill.total).toBe(470); // 100 x 4.70
  });

  it('switches payable table above the cliff', () => {
    const bill = computeBill(tn, { units: 600, sanctionedLoadKw: 2 });
    expect(bill.total).toBe(2350); // 500 x 4.70 once only 100 units are free
  });

  it('shows the approved tariff when subsidies are off', () => {
    expect(computeBill(tn, { units: 300, sanctionedLoadKw: 2, subsidies: { apply: false } }).total).toBe(1485);
  });
});

describe('solar charges', () => {
  const solarBook = withCategory({
    charges: [
      { kind: 'per_solar_kwh', id: 'network', name: 'Network charge on solar', rate: 0.32, maxSolarKw: 10, variable: false, cite, verification: 'secondary' },
      { kind: 'per_solar_kw', id: 'rebate', name: 'Solar fixed-charge rebate', amount: -25, period: 'month', maxKw: 10, variable: false, cite, verification: 'verified' },
    ],
    subsidies: [],
    tod: undefined,
  });
  const run = (capacityKw: number, generatedUnits?: number) =>
    computeBill(solarBook, {
      units: 250,
      sanctionedLoadKw: 3,
      solar: { exportedUnits: 0, capacityKw, ...(generatedUnits !== undefined ? { generatedUnits } : {}) },
    });

  it('charges per kWh generated within the capacity band and rebates per kW', () => {
    const bill = run(3, 400);
    expect(bill.lines.find((l) => l.id === 'network')?.amount).toBe(128);
    expect(bill.lines.find((l) => l.id === 'rebate')?.amount).toBe(-75);
  });

  it('skips the generation charge outside its band and caps the rebate', () => {
    const bill = run(12, 400);
    expect(bill.lines.find((l) => l.id === 'network')).toBeUndefined();
    expect(bill.lines.find((l) => l.id === 'rebate')?.amount).toBe(-250);
  });

  it('warns when generation is needed but missing', () => {
    expect(run(3).warnings.some((w) => w.includes('generatedUnits'))).toBe(true);
  });
});

describe('subsidised export bands and banking charge', () => {
  const regime: SolarRegime = {
    id: 'nm',
    type: 'net_metering',
    label: 'NM',
    default: true,
    exportRate: {
      value: 3.89,
      basis: 'order',
      variable: false,
      withCentralSubsidy: [
        { upToKw: 2, value: 1.96 },
        { upToKw: 3, value: 2.14 },
        { upToKw: null, value: 2.58 },
      ],
    },
    settlement: { period: 'financial_year', surplus: 'paid_at_export_rate', bankingChargePercentPerMonth: 2 },
    cite,
    verification: 'verified',
  };

  it('picks the band containing the whole system when the subsidy was taken', () => {
    expect(exportRateFor(regime, 2, true)).toBe(1.96);
    expect(exportRateFor(regime, 2.5, true)).toBe(2.14);
    expect(exportRateFor(regime, 5, true)).toBe(2.58);
    expect(exportRateFor(regime, 2, false)).toBe(3.89);
    expect(exportRateFor(regime, undefined, true)).toBe(3.89);
  });

  it('deducts the monthly banking charge from carried units', () => {
    const result = settleSolarCycle(regime, 50, { exportedUnits: 150 }, 2);
    expect(result.closingBankUnits).toBeCloseTo(100 * 0.98 ** 2, 9);
    const settled = settleSolarCycle(regime, 50, { exportedUnits: 150, settle: true, capacityKw: 3, centralSubsidy: true }, 2);
    expect(settled.settlementPayout).toBeCloseTo(100 * 2.14, 9);
  });

  it('warns when the subsidy choice changes the export rate but was not given', () => {
    const withBands = { ...book, rooftopSolar: { ...book.rooftopSolar, regimes: [regime] } };
    const bill = computeBill(withBands, { units: 100, sanctionedLoadKw: 3, solar: { exportedUnits: 10 } });
    expect(bill.warnings.some((w) => w.includes('central subsidy'))).toBe(true);
  });
});

describe('load rounding and ToD thresholds', () => {
  it('rounds to the nearest quarter kW', () => {
    expect(roundLoad(2.3, 'round_quarter')).toBe(2.25);
    expect(roundLoad(2.4, 'round_quarter')).toBe(2.5);
    expect(roundLoad(2.3, 'none')).toBe(2.3);
  });

  it('applies ToD only above its consumption threshold', () => {
    const tod = domestic.tod;
    if (!tod) throw new Error('fixture has ToD');
    const kerala = withCategory({ tod: { ...tod, aboveUnits: 500 }, subsidies: [] });
    const below = computeBill(kerala, { units: 400, sanctionedLoadKw: 3, flags: ['smart_meter'], todUnits: { peak: 100 } });
    expect(below.totals.tod).toBe(0);
    expect(below.warnings.some((w) => w.includes('ToD'))).toBe(false);
    const above = computeBill(kerala, { units: 600, sanctionedLoadKw: 3, flags: ['smart_meter'], todUnits: { peak: 100 } });
    expect(above.totals.tod).toBeGreaterThan(0);
  });
});

describe('opt-in schemes in automatic mode', () => {
  it('skips opt-in schemes and says so', () => {
    const gj = withCategory({
      subsidies: [
        {
          rule: 'entitlement',
          id: 'gj',
          name: 'Entitlement scheme',
          authority: 'Test Govt',
          capUnits: 200,
          baselineMultiplier: 1.1,
          excessBilling: 'excess_only',
          covers: 'total',
          optIn: true,
          eligibility: 'Registered',
          cite,
          verification: 'verified',
        },
      ],
    });
    const bill = computeBill(gj, { units: 100, sanctionedLoadKw: 3, subsidies: { apply: 'automatic', baselineUnits: 100 } });
    expect(bill.totals.subsidies).toBe(0);
    expect(bill.warnings.some((w) => w.includes('needs registration'))).toBe(true);
  });
});
