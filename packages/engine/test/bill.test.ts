import { describe, expect, it } from 'vitest';
import { computeBill } from '../src/index.js';
import { book, domestic, withCategory } from './fixtures.js';

const lineAmount = (lines: readonly { id: string; amount: number }[], id: string): number | undefined =>
  lines.find((l) => l.id === id)?.amount;

describe('computeBill: slabs, fixed and chained charges', () => {
  it('prices a telescopic bill line by line (hand-checked)', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 250, sanctionedLoadKw: 3 });
    // Energy 100 x 4.5 + 150 x 6 = 1350; fixed 2 kW x 20 + 1 kW x 50 = 90
    // FPPCA 250 x 0.5 = 125; duty 5% of 1565 = 78.25; PPAC 10% of 1440 = 144
    expect(bill.scheduleId).toBe('standard');
    expect(bill.totals.energy).toBe(1350);
    expect(lineAmount(bill.lines, 'fixed')).toBe(90);
    expect(lineAmount(bill.lines, 'fppca')).toBe(125);
    expect(lineAmount(bill.lines, 'duty')).toBe(78.25);
    expect(lineAmount(bill.lines, 'ppac')).toBe(144);
    expect(bill.total).toBe(1787.25);
    expect(bill.payable).toBe(1787);
  });

  it('applies utility-specific charges only to that utility', () => {
    const bill = computeBill(book, { utilityId: 'util-b', units: 250, sanctionedLoadKw: 3 });
    expect(lineAmount(bill.lines, 'ppac')).toBeUndefined();
    expect(bill.total).toBe(1643.25);
  });

  it('picks the small-consumer schedule at or below 100 units', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 80, sanctionedLoadKw: 3, subsidies: { apply: false } });
    expect(bill.scheduleId).toBe('small');
    expect(bill.totals.energy).toBe(270); // 50 x 3 + 30 x 4
    expect(bill.total).toBe(456);
  });

  it('uses the three-phase fixed rule when phase is three', () => {
    const bill = computeBill(book, { utilityId: 'util-b', units: 250, sanctionedLoadKw: 3, phase: 'three' });
    expect(lineAmount(bill.lines, 'fixed')).toBe(200);
  });

  it('rounds sanctioned load up before pricing fixed charges', () => {
    const bill = computeBill(book, { utilityId: 'util-b', units: 0, sanctionedLoadKw: 2.3, subsidies: { apply: false } });
    expect(lineAmount(bill.lines, 'fixed')).toBe(90); // ceil(2.3) = 3 kW
  });

  it('cites sources on every line and flags unverified and variable data', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 250, sanctionedLoadKw: 3 });
    for (const line of bill.lines) expect(line.cite[0]?.url).toBe('https://example.org/order.pdf');
    expect(bill.warnings.some((w) => w.includes('Unverified data used for: PPAC'))).toBe(true);
    expect(bill.warnings.some((w) => w.includes('Fuel cost adjustment changes month to month'))).toBe(true);
  });

  it('rejects impossible inputs', () => {
    expect(() => computeBill(book, { units: -1, sanctionedLoadKw: 1 })).toThrow(RangeError);
    expect(() => computeBill(book, { units: 10, sanctionedLoadKw: 0 })).toThrow(RangeError);
    expect(() => computeBill(book, { units: 10, sanctionedLoadKw: 1, utilityId: 'nope' })).toThrow(/not covered/);
    expect(() => computeBill(book, { units: 10, sanctionedLoadKw: 1, categoryId: 'nope' })).toThrow(/Unknown category/);
    expect(() => computeBill(book, { units: 10, sanctionedLoadKw: 1, todUnits: { solar: -2 } })).toThrow(RangeError);
  });
});

describe('computeBill: whole-consumption and bimonthly tariffs', () => {
  it('charges all units at one rate under a non-telescopic schedule', () => {
    const kerala = withCategory({
      energy: {
        ...domestic.energy,
        schedules: [
          { id: 'telescopic', when: { upToUnits: 250 }, method: 'telescopic', slabs: [{ upTo: 50, rate: 3.25 }, { upTo: null, rate: 4.05 }] },
          {
            id: 'whole',
            when: { aboveUnits: 250 },
            method: 'whole',
            slabs: [
              { upTo: 300, rate: 6.4 },
              { upTo: 350, rate: 7.25 },
              { upTo: null, rate: 8.8 },
            ],
          },
        ],
      },
      charges: [],
    });
    const bill = computeBill(kerala, { units: 320, sanctionedLoadKw: 1 });
    expect(bill.scheduleId).toBe('whole');
    expect(bill.totals.energy).toBe(2320); // 320 x 7.25
  });

  it('doubles monthly fixed charges and bands them on the monthly average for bimonthly bills', () => {
    const bimonthly = withCategory({
      billingCycle: 'bimonthly',
      energy: {
        ...domestic.energy,
        schedules: [{ id: 'all', method: 'telescopic', slabs: [{ upTo: 100, rate: 2.35 }, { upTo: 400, rate: 4.7 }, { upTo: null, rate: 6.3 }] }],
      },
      fixed: {
        ...domestic.fixed,
        rules: [
          {
            id: 'by-use',
            bandBy: 'units',
            unitsBasis: 'monthly_average',
            method: 'whole',
            bands: [
              { upTo: 100, amount: 30, per: 'connection' },
              { upTo: null, amount: 50, per: 'connection' },
            ],
            period: 'month',
            loadRounding: 'none',
          },
        ],
      },
      charges: [],
      subsidies: [
        { rule: 'free_units', id: 'free-100', name: '100 free units', authority: 'Test Govt', units: 100, optIn: false, eligibility: 'All', cite: [{ ref: 'order' }], verification: 'verified' },
      ],
    });
    const bill = computeBill(bimonthly, { units: 300, sanctionedLoadKw: 1, subsidies: { apply: true } });
    expect(bill.monthsInCycle).toBe(2);
    expect(bill.totals.energy).toBe(1175); // 100 x 2.35 + 200 x 4.7
    expect(lineAmount(bill.lines, 'fixed')).toBe(100); // 150/month average -> Rs 50 x 2 months
    expect(bill.totals.subsidies).toBe(-235); // first 100 units at 2.35
    expect(bill.total).toBe(1040);
  });
});

describe('computeBill: subsidies', () => {
  it('zeroes the bill at or below the threshold', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 80, sanctionedLoadKw: 3, subsidies: { apply: true } });
    expect(bill.total).toBe(0);
  });

  it('caps a percentage subsidy', () => {
    // pre-subsidy 1044.75; 50% = 522.38 -> capped at 500
    const bill = computeBill(book, { utilityId: 'util-a', units: 150, sanctionedLoadKw: 3, subsidies: { apply: true } });
    expect(bill.totals.subsidies).toBe(-500);
    expect(bill.total).toBe(544.75);
  });

  it('applies automatic subsidies by default and none when switched off', () => {
    expect(computeBill(book, { utilityId: 'util-a', units: 80, sanctionedLoadKw: 3 }).total).toBe(0);
    const raw = computeBill(book, { utilityId: 'util-a', units: 80, sanctionedLoadKw: 3, subsidies: { apply: false } });
    expect(raw.totals.subsidies).toBe(0);
    expect(raw.total).toBe(456);
  });

  it('can restrict to selected schemes', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 150, sanctionedLoadKw: 3, subsidies: { apply: true, include: ['zero-100'] } });
    expect(bill.totals.subsidies).toBe(0);
  });

  describe('entitlement schemes (Gruha Jyothi style)', () => {
    const entitlementBook = withCategory({
      subsidies: [
        {
          rule: 'entitlement',
          id: 'gj',
          name: 'Entitlement scheme',
          authority: 'Test Govt',
          capUnits: 200,
          baselineMultiplier: 1.1,
          excessBilling: 'excess_only',
          fullBillAboveUnits: 200,
          covers: 'total',
          optIn: true,
          eligibility: 'Registered households',
          cite: [{ ref: 'order' }],
          verification: 'verified',
        },
      ],
    });

    it('zeroes the bill within the entitlement', () => {
      const bill = computeBill(entitlementBook, { utilityId: 'util-b', units: 100, sanctionedLoadKw: 3, subsidies: { apply: true, baselineUnits: 100 } });
      expect(bill.total).toBe(0);
      expect(bill.warnings.some((w) => w.includes('requires registration'))).toBe(true);
    });

    it('bills only the units above the entitlement', () => {
      // entitlement 110; consumer pays a 40-unit bill: 40 x 3 + 90 fixed + 20 FPPCA + 5% duty on 230
      const bill = computeBill(entitlementBook, { utilityId: 'util-b', units: 150, sanctionedLoadKw: 3, subsidies: { apply: true, baselineUnits: 100 } });
      expect(bill.total).toBe(241.5);
    });

    it('lapses above the full-bill threshold', () => {
      const bill = computeBill(entitlementBook, { utilityId: 'util-b', units: 250, sanctionedLoadKw: 3, subsidies: { apply: true, baselineUnits: 100 } });
      expect(bill.totals.subsidies).toBe(0);
    });

    it('warns instead of guessing when the baseline is missing', () => {
      const bill = computeBill(entitlementBook, { utilityId: 'util-b', units: 100, sanctionedLoadKw: 3, subsidies: { apply: true } });
      expect(bill.totals.subsidies).toBe(0);
      expect(bill.warnings.some((w) => w.includes('baseline'))).toBe(true);
    });
  });
});

describe('computeBill: time of day', () => {
  it('adds ToD surcharges and rebates on the average energy rate', () => {
    const bill = computeBill(book, {
      utilityId: 'util-a',
      units: 250,
      sanctionedLoadKw: 3,
      flags: ['smart_meter'],
      todUnits: { solar: 50, peak: 100 },
    });
    // average rate 1350/250 = 5.4; solar 50 x -1.08 = -54; peak 100 x 1.08 = 108
    expect(lineAmount(bill.lines, 'tod-solar')).toBe(-54);
    expect(lineAmount(bill.lines, 'tod-peak')).toBe(108);
    expect(bill.total).toBe(1841.25);
  });

  it('ignores a ToD split for consumers ToD does not apply to', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 250, sanctionedLoadKw: 3, todUnits: { solar: 50 } });
    expect(bill.totals.tod).toBe(0);
    expect(bill.warnings.some((w) => w.startsWith('ToD split ignored'))).toBe(true);
  });

  it('warns when ToD is mandatory but no split was given', () => {
    const bill = computeBill(book, { utilityId: 'util-a', units: 250, sanctionedLoadKw: 3, flags: ['smart_meter'] });
    expect(bill.warnings.some((w) => w.includes('no time-of-day split'))).toBe(true);
  });

  it('scales an over-long split down to consumption', () => {
    const bill = computeBill(book, { utilityId: 'util-b', units: 100, sanctionedLoadKw: 3, flags: ['smart_meter'], todUnits: { peak: 200 }, subsidies: { apply: false } });
    // energy 'small' 100 units: 150 + 200 = 350, avg 3.5; split scaled to 100 -> +70
    expect(lineAmount(bill.lines, 'tod-peak')).toBe(70);
    expect(bill.warnings.some((w) => w.includes('exceeds consumption'))).toBe(true);
  });
});

describe('computeBill: rooftop solar', () => {
  it('nets exports and the bank against imports under net metering', () => {
    const bill = computeBill(book, {
      utilityId: 'util-b',
      units: 300,
      sanctionedLoadKw: 3,
      subsidies: { apply: false },
      solar: { exportedUnits: 200, openingBankUnits: 50 },
    });
    expect(bill.billedUnits).toBe(50);
    expect(bill.solar?.closingBankUnits).toBe(0);
    expect(bill.total).toBe(278.25); // 150 + 90 + 25 + 13.25
  });

  it('banks surplus and pays it at settlement', () => {
    const bill = computeBill(book, {
      utilityId: 'util-b',
      units: 100,
      sanctionedLoadKw: 3,
      subsidies: { apply: false },
      solar: { exportedUnits: 180, settle: true },
    });
    expect(bill.billedUnits).toBe(0);
    expect(bill.solar?.settledUnits).toBe(80);
    expect(lineAmount(bill.lines, 'solar-settlement')).toBe(-240);
    expect(bill.total).toBe(-145.5); // 90 fixed + 4.5 duty - 240
  });

  it('carries the bank forward when the cycle does not settle', () => {
    const bill = computeBill(book, { utilityId: 'util-b', units: 100, sanctionedLoadKw: 3, solar: { exportedUnits: 180 } });
    expect(bill.solar?.closingBankUnits).toBe(80);
    expect(bill.totals.solar).toBe(0);
  });

  it('credits exports in rupees under net billing', () => {
    const bill = computeBill(book, {
      utilityId: 'util-b',
      units: 200,
      sanctionedLoadKw: 3,
      subsidies: { apply: false },
      solar: { regimeId: 'nb', exportedUnits: 100 },
    });
    expect(bill.billedUnits).toBe(200);
    expect(lineAmount(bill.lines, 'solar-export-credit')).toBe(-250);
    expect(bill.total).toBe(1052);
  });

  it('pays all generation under gross metering', () => {
    const bill = computeBill(book, {
      utilityId: 'util-b',
      units: 200,
      sanctionedLoadKw: 12,
      solar: { regimeId: 'gm', exportedUnits: 0, generatedUnits: 1000 },
    });
    expect(lineAmount(bill.lines, 'solar-export-credit')).toBe(-3500);
  });

  it('rejects unknown regimes', () => {
    expect(() => computeBill(book, { units: 100, sanctionedLoadKw: 3, solar: { regimeId: 'x', exportedUnits: 1 } })).toThrow(/Unknown solar regime/);
  });
});
