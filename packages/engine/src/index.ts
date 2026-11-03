/**
 * @openbijli/engine
 *
 * computeBill()   one billing cycle from a tariff book (slabs, fixed, ToD, charges,
 *                 subsidies, net metering / net billing / gross metering)
 * simulateSolar() rooftop right-sizing and payback, billing every cycle for real
 */
export { computeBill } from './bill/compute.js';
export { TariffDataError, priceEnergy, selectSchedule } from './bill/energy.js';
export { computeFixed, roundLoad } from './bill/fixed.js';
export { exportRateFor, regimesForCapacity, selectRegime, settleSolarCycle } from './bill/solar.js';
export { todPeriodAt, todPeriodForHour, inWindow } from './bill/tod.js';
export { matchesCondition } from './bill/context.js';
export type * from './bill/types.js';

export { simulateSolar, FY_MONTHS } from './solar/simulate.js';
export type {
  CycleResult,
  SizeResult,
  SolarSimulationInput,
  SolarSimulationResult,
  YearOneSummary,
} from './solar/simulate.js';
export { DEFAULT_ASSUMPTIONS, resolveAssumptions, type FinancialAssumptions } from './solar/assumptions.js';
export { LOAD_PROFILES, resolveLoadProfile, type LoadProfile, type LoadProfileId } from './solar/profiles.js';
export { hourlyGenerationShape, cosZenith, equationOfTimeMinutes, DAYS_IN_MONTH } from './solar/geometry.js';
export { monthBalance, type MonthBalance } from './solar/balance.js';
export { installedCost, irr, npv, paybackYears, tieredSubsidy } from './solar/finance.js';

export { formatInr, roundPaise } from './money.js';
