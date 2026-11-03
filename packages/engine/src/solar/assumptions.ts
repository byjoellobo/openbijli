/**
 * Financial and technical assumptions for the payback simulator. Defaults are
 * deliberately plain so users can see and change them; the web app shows all of them.
 */
export interface FinancialAssumptions {
  /** Analysis horizon in years (module warranties are typically 25 years). */
  readonly years: number;
  /** AC energy delivered per kWh/m2 of plane-of-array irradiance per kWp (temperature, soiling, inverter, wiring). */
  readonly performanceRatio: number;
  /** Fractional output loss per year, e.g. 0.005 = 0.5%/yr. */
  readonly degradationPerYear: number;
  /** Nominal yearly change in grid tariffs. 0 is the conservative case. */
  readonly tariffEscalationPerYear: number;
  /** Nominal discount rate for NPV (your next-best use of the money, e.g. an FD). */
  readonly discountRate: number;
  /** Annual maintenance, INR per kW, in today's money. */
  readonly omPerKwPerYear: number;
  readonly omEscalationPerYear: number;
  /** Years of free maintenance included by the vendor (PM Surya Ghar vendors include CMC). */
  readonly omFreeYears: number;
  /** Year in which the inverter is replaced, or null to ignore. */
  readonly inverterReplacementYear: number | null;
  readonly inverterCostPerKw: number;
}

/**
 * performanceRatio 0.75: PM Surya Ghar commissioning minimum.
 * degradationPerYear 0.008: the PM Surya Ghar warranty floor (80% after 25 years). Field
 * surveys of Indian rooftops measured worse (1.99%/yr, NISE 2018); see data/national/india.json.
 */
export const DEFAULT_ASSUMPTIONS: FinancialAssumptions = {
  years: 25,
  performanceRatio: 0.75,
  degradationPerYear: 0.008,
  tariffEscalationPerYear: 0.02,
  discountRate: 0.08,
  omPerKwPerYear: 500,
  omEscalationPerYear: 0.05,
  omFreeYears: 5,
  inverterReplacementYear: 12,
  inverterCostPerKw: 8000,
};

export function resolveAssumptions(overrides: Partial<FinancialAssumptions> | undefined): FinancialAssumptions {
  const merged = { ...DEFAULT_ASSUMPTIONS, ...overrides };
  if (!Number.isInteger(merged.years) || merged.years < 1 || merged.years > 40) throw new RangeError('years must be an integer 1-40');
  if (merged.performanceRatio <= 0 || merged.performanceRatio > 1) throw new RangeError('performanceRatio must be in (0, 1]');
  if (merged.degradationPerYear < 0 || merged.degradationPerYear > 0.05) throw new RangeError('degradationPerYear must be 0-0.05');
  if (merged.discountRate <= -1) throw new RangeError('discountRate must be > -1');
  return merged;
}
