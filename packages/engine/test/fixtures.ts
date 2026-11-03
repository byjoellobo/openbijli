/**
 * A synthetic tariff book that exercises every engine feature. Values are invented
 * round numbers so expected bills can be worked out by hand in the tests.
 */
import type { Category, SolarResource, TariffBook } from '@open-tariff-india/data';

const cite = [{ ref: 'order' }];

export const domestic: Category = {
  id: 'domestic',
  code: 'LT-1',
  name: 'Test domestic',
  description: 'Synthetic domestic category',
  billingCycle: 'monthly',
  energy: {
    schedules: [
      { id: 'small', when: { upToUnits: 100 }, method: 'telescopic', slabs: [{ upTo: 50, rate: 3 }, { upTo: null, rate: 4 }] },
      {
        id: 'standard',
        method: 'telescopic',
        slabs: [
          { upTo: 100, rate: 4.5 },
          { upTo: 300, rate: 6 },
          { upTo: null, rate: 8 },
        ],
      },
    ],
    cite,
    verification: 'verified',
  },
  fixed: {
    rules: [
      {
        id: 'three-phase',
        when: { phase: 'three' },
        bandBy: 'none',
        method: 'whole',
        bands: [{ upTo: null, amount: 200, per: 'connection' }],
        period: 'month',
        loadRounding: 'none',
      },
      {
        id: 'single-phase',
        label: 'Fixed charge (per kW)',
        bandBy: 'load_kw',
        method: 'telescopic',
        bands: [
          { upTo: 2, amount: 20, per: 'kw' },
          { upTo: null, amount: 50, per: 'kw' },
        ],
        period: 'month',
        loadRounding: 'ceil',
      },
    ],
    cite,
    verification: 'verified',
  },
  charges: [
    { kind: 'per_kwh', id: 'fppca', name: 'Fuel cost adjustment', rate: 0.5, variable: true, asOf: '2026-09-01', cite, verification: 'verified' },
    { kind: 'percent', id: 'duty', name: 'Electricity duty', percent: 5, of: ['energy', 'fixed', 'fppca'], variable: false, cite, verification: 'verified' },
    { kind: 'percent', id: 'ppac', name: 'PPAC (utility A only)', percent: 10, of: ['energy', 'fixed'], utilities: ['util-a'], variable: true, cite, verification: 'unverified' },
  ],
  tod: {
    applicability: 'Smart-meter consumers',
    appliesIf: { flags: ['smart_meter'] },
    mandatory: true,
    periods: [
      { id: 'solar', name: 'Solar hours', windows: [{ from: '09:00', to: '17:00' }], adjustment: { type: 'percent_of_energy_rate', value: -20 } },
      { id: 'peak', name: 'Peak', windows: [{ from: '18:00', to: '22:00' }], adjustment: { type: 'percent_of_energy_rate', value: 20 } },
    ],
    cite,
    verification: 'verified',
  },
  subsidies: [
    { rule: 'zero_bill_up_to', id: 'zero-100', name: 'Zero bill to 100', authority: 'Test Govt', thresholdUnits: 100, covers: 'total', optIn: false, eligibility: 'All', cite, verification: 'verified' },
    {
      rule: 'percent_band',
      id: 'half-200',
      name: 'Half off 101-200',
      authority: 'Test Govt',
      aboveUnits: 100,
      upToUnits: 200,
      percent: 50,
      capAmount: 500,
      covers: 'total',
      optIn: false,
      eligibility: 'All',
      cite,
      verification: 'verified',
    },
  ],
};

export const book: TariffBook = {
  schemaVersion: 1,
  bookId: 'xx-test',
  title: 'Test State Retail Tariff',
  state: 'Test State',
  stateCode: 'XX',
  regulator: { name: 'Test Regulatory Commission', short: 'TRC', url: 'https://example.org/' },
  utilities: [
    { id: 'util-a', name: 'Utility A Limited', shortName: 'UA', servedArea: 'North', solarResource: 'testville' },
    { id: 'util-b', name: 'Utility B Limited', shortName: 'UB', servedArea: 'South', solarResource: 'testville' },
  ],
  financialYear: '2026-27',
  effectiveFrom: '2026-04-01',
  status: 'complete',
  order: { title: 'Test tariff order 2026-27', cite, verification: 'verified' },
  categories: [domestic],
  rooftopSolar: {
    regimes: [
      {
        id: 'nm',
        type: 'net_metering',
        label: 'Net metering',
        default: true,
        maxKw: 10,
        exportRate: { value: 3, basis: 'order', variable: false },
        settlement: { period: 'financial_year', surplus: 'paid_at_export_rate' },
        cite,
        verification: 'verified',
      },
      {
        id: 'nb',
        type: 'net_billing',
        label: 'Net billing',
        default: false,
        exportRate: { value: 2.5, basis: 'order', variable: false },
        settlement: { period: 'billing_cycle', surplus: 'paid_at_export_rate' },
        cite,
        verification: 'verified',
      },
      {
        id: 'gm',
        type: 'gross_metering',
        label: 'Gross metering',
        default: false,
        minKw: 10,
        exportRate: { value: 3.5, basis: 'order', variable: false },
        settlement: { period: 'billing_cycle', surplus: 'paid_at_export_rate' },
        cite,
        verification: 'verified',
      },
    ],
    capacityLimit: { maxPercentOfSanctionedLoad: 100, note: 'Up to sanctioned load' },
    stateSubsidy: { description: 'Test top-up', tiers: [{ upToKw: 2, perKw: 5000 }, { upToKw: null, perKw: 0 }], capInr: 10000, cite, verification: 'verified' },
    cite,
    verification: 'verified',
  },
  sources: {
    order: { title: 'Test order', publisher: 'TRC', url: 'https://example.org/order.pdf', type: 'regulator_order', accessed: '2026-10-29' },
  },
  gaps: [],
  changelog: [{ date: '2026-10-29', summary: 'Fixture' }],
};

export function withCategory(patch: Partial<Category>): TariffBook {
  return { ...book, categories: [{ ...domestic, ...patch }] };
}

export const resource: SolarResource = {
  id: 'testville',
  name: 'Testville',
  stateCode: 'XX',
  lat: 13,
  lon: 77,
  poaKwhPerM2Day: Array.from({ length: 12 }, () => 5),
  ghiKwhPerM2Day: Array.from({ length: 12 }, () => 5),
};

export const centralSubsidy = {
  id: 'pm-surya-ghar',
  name: 'PM Surya Ghar CFA',
  description: 'test',
  tiers: [
    { upToKw: 2, perKw: 30000 },
    { upToKw: 3, perKw: 18000 },
    { upToKw: null, perKw: 0 },
  ],
  capInr: 78000,
  cite,
  verification: 'verified' as const,
};
