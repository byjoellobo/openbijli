import type { Category, CentralSubsidy, ContextFlag, SolarRegime, SolarResource, TariffBook } from '@openbijli/data';
import { computeBill } from '../bill/compute.js';
import { matchesCondition } from '../bill/context.js';
import { regimesForCapacity } from '../bill/solar.js';
import { todPeriodForHour } from '../bill/tod.js';
import type { Area, BillContext, BillInput, Phase, SubsidyOptions } from '../bill/types.js';
import { resolveAssumptions, type FinancialAssumptions } from './assumptions.js';
import { monthBalance, type MonthBalance } from './balance.js';
import { installedCost, irr, npv, paybackYears, tieredSubsidy } from './finance.js';
import { DAYS_IN_MONTH, hourlyGenerationShape } from './geometry.js';
import { resolveLoadProfile, type LoadProfileId } from './profiles.js';

/** Financial-year month order as calendar indices (Apr = 3 ... Mar = 2). */
export const FY_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface SolarSimulationInput {
  readonly book: TariffBook;
  readonly resource: SolarResource;
  /** Grid consumption before solar, kWh per calendar month, January first. */
  readonly monthlyConsumptionKwh: readonly number[];
  readonly sanctionedLoadKw: number;
  readonly utilityId?: string;
  readonly categoryId?: string;
  readonly phase?: Phase;
  readonly area?: Area;
  readonly flags?: readonly ContextFlag[];
  /** Candidate system sizes in kWp. Default: whole kW from 1 up to the largest allowed (max 10). */
  readonly sizesKw?: readonly number[];
  readonly roofLimitKw?: number;
  readonly regimeId?: string;
  /** Overrides the installed-cost bands with a flat INR/kW price. */
  readonly costPerKw?: number;
  readonly installedCostTiers?: readonly { upToKw: number | null; inrPerKw: number }[];
  /** Central subsidy scheme (PM Surya Ghar). null = no central subsidy. */
  readonly centralSubsidy?: CentralSubsidy | null;
  readonly includeStateSubsidy?: boolean;
  /** Government bill subsidies (free units). Off by default. */
  readonly billSubsidies?: SubsidyOptions;
  readonly loadProfile?: LoadProfileId | readonly number[];
  readonly assumptions?: Partial<FinancialAssumptions>;
}

export interface CycleResult {
  readonly label: string;
  readonly consumption: number;
  readonly generation: number;
  readonly selfConsumed: number;
  readonly imported: number;
  readonly exported: number;
  readonly billWithout: number;
  readonly billWith: number;
  readonly closingBankUnits: number;
}

export interface YearOneSummary {
  readonly consumption: number;
  readonly generation: number;
  readonly selfConsumed: number;
  readonly imported: number;
  readonly exported: number;
  readonly billWithout: number;
  readonly billWith: number;
  readonly savings: number;
  /** INR received for exports (net-billing credits, gross FiT, net-metering settlements). */
  readonly exportIncome: number;
  readonly settledUnits: number;
  readonly lapsedUnits: number;
  /** Share of generation used directly in the home. */
  readonly selfConsumptionRatio: number;
  /** Year-one savings per kWh generated. */
  readonly valuePerKwh: number;
  readonly cycles: readonly CycleResult[];
}

export interface SizeResult {
  readonly sizeKw: number;
  readonly feasible: boolean;
  readonly infeasibleReason?: string;
  readonly regimeId?: string;
  readonly regimeType?: SolarRegime['type'];
  readonly grossCost: number;
  readonly centralSubsidy: number;
  readonly stateSubsidy: number;
  readonly netCost: number;
  readonly year1?: YearOneSummary;
  readonly cashflows: readonly number[];
  readonly simplePaybackYears: number | null;
  readonly discountedPaybackYears: number | null;
  readonly npv: number | null;
  readonly irr: number | null;
  /** Levelised cost of solar energy, INR/kWh. */
  readonly lcoe: number | null;
}

export interface SolarSimulationResult {
  readonly utilityId: string;
  readonly bookId: string;
  readonly financialYear: string;
  readonly resourceId: string;
  readonly annualConsumption: number;
  readonly annualBillWithout: number;
  /** Year-one bill divided by consumption: what an average grid kWh costs this household. */
  readonly averageTariff: number;
  readonly maxFeasibleKw: number;
  readonly limits: readonly string[];
  readonly sizes: readonly SizeResult[];
  readonly recommended: SizeResult | null;
  readonly rationale: readonly string[];
  readonly assumptions: FinancialAssumptions;
  readonly warnings: readonly string[];
}

interface Cycle {
  readonly label: string;
  readonly fyMonthIndexes: readonly number[];
  readonly calendarMonths: readonly number[];
}

function buildCycles(monthsInCycle: number): Cycle[] {
  const cycles: Cycle[] = [];
  for (let start = 0; start < 12; start += monthsInCycle) {
    const fyMonthIndexes = Array.from({ length: monthsInCycle }, (_, i) => start + i);
    const calendarMonths = fyMonthIndexes.map((i) => FY_MONTHS[i] as number);
    const names = calendarMonths.map((m) => MONTH_NAMES[m] as string);
    cycles.push({ label: names.join('–'), fyMonthIndexes, calendarMonths });
  }
  return cycles;
}

function isSettlementCycle(regime: SolarRegime, cycle: Cycle, index: number, cycleCount: number): boolean {
  switch (regime.settlement.period) {
    case 'financial_year':
      return index === cycleCount - 1;
    case 'custom_annual':
      return cycle.calendarMonths.includes((regime.settlement.yearEndMonth ?? 3) - 1);
    default:
      return false;
  }
}

function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function sumHours(balances: readonly MonthBalance[], pick: (b: MonthBalance) => readonly number[]): number[] {
  return Array.from({ length: 24 }, (_, h) => sumBy(balances, (b) => pick(b)[h] ?? 0));
}

function makeTodSplitter(category: Category, ctx: BillContext): ((byHour: readonly number[]) => Record<string, number>) | null {
  const tod = category.tod;
  if (!tod || !tod.mandatory || !matchesCondition(tod.appliesIf, ctx)) return null;
  const periodOfHour = Array.from({ length: 24 }, (_, h) => todPeriodForHour(tod, h));
  return (byHour) => {
    const split: Record<string, number> = {};
    byHour.forEach((kwh, hour) => {
      const period = periodOfHour[hour];
      if (period) split[period] = (split[period] ?? 0) + kwh;
    });
    return split;
  };
}

interface SimContext {
  readonly input: SolarSimulationInput;
  readonly category: Category;
  readonly ctx: BillContext;
  readonly cycles: readonly Cycle[];
  readonly genShapes: readonly (readonly number[])[];
  readonly loadShape: readonly number[];
  readonly assumptions: FinancialAssumptions;
  readonly todSplit: ((byHour: readonly number[]) => Record<string, number>) | null;
  readonly baselineCycleBills: readonly number[];
  readonly baseBillInput: Omit<BillInput, 'units'>;
}

function fyBalances(sim: SimContext, sizeKw: number, yieldFactor: number): MonthBalance[] {
  return FY_MONTHS.map((month) =>
    monthBalance({
      consumptionKwh: sim.input.monthlyConsumptionKwh[month] ?? 0,
      days: DAYS_IN_MONTH[month] ?? 30,
      sizeKw,
      dailyYieldPerKwp: (sim.input.resource.poaKwhPerM2Day[month] ?? 0) * sim.assumptions.performanceRatio * yieldFactor,
      generationShape: sim.genShapes[month] ?? [],
      loadShape: sim.loadShape,
    }),
  );
}

interface YearOutcome {
  readonly billWith: number;
  readonly exportIncome: number;
  readonly settledUnits: number;
  readonly lapsedUnits: number;
  readonly closingBank: number;
  readonly cycles: CycleResult[];
  readonly balances: MonthBalance[];
}

function simulateYear(sim: SimContext, sizeKw: number, regime: SolarRegime, yieldFactor: number, openingBank: number): YearOutcome {
  const balances = fyBalances(sim, sizeKw, yieldFactor);
  let bank = openingBank;
  let billWith = 0;
  let exportIncome = 0;
  let settledUnits = 0;
  let lapsedUnits = 0;
  const cycles: CycleResult[] = [];

  sim.cycles.forEach((cycle, index) => {
    const months = cycle.fyMonthIndexes.map((i) => balances[i] as MonthBalance);
    const consumption = sumBy(months, (m) => m.consumption);
    const imported = sumBy(months, (m) => m.imported);
    const exported = sumBy(months, (m) => m.exported);
    const generation = sumBy(months, (m) => m.generation);
    const gross = regime.type === 'gross_metering';
    const todUnits = sim.todSplit?.(sumHours(months, (m) => (gross ? m.consumptionByHour : m.importedByHour)));
    const bill = computeBill(sim.input.book, {
      ...sim.baseBillInput,
      units: gross ? consumption : imported,
      ...(todUnits ? { todUnits } : {}),
      solar: {
        regimeId: regime.id,
        exportedUnits: exported,
        generatedUnits: generation,
        openingBankUnits: bank,
        settle: isSettlementCycle(regime, cycle, index, sim.cycles.length),
        capacityKw: sizeKw,
        centralSubsidy: sim.input.centralSubsidy !== null && sim.input.centralSubsidy !== undefined,
      },
    });
    const solar = bill.solar;
    bank = solar?.closingBankUnits ?? 0;
    settledUnits += solar?.settledUnits ?? 0;
    if (regime.settlement.surplus === 'lapses') lapsedUnits += solar?.settledUnits ?? 0;
    billWith += bill.total - bill.totals.solar;
    exportIncome += -bill.totals.solar;
    cycles.push({
      label: cycle.label,
      consumption,
      generation,
      selfConsumed: sumBy(months, (m) => m.selfConsumed),
      imported,
      exported,
      billWithout: sim.baselineCycleBills[index] ?? 0,
      billWith: bill.total,
      closingBankUnits: bank,
    });
  });

  return { billWith, exportIncome, settledUnits, lapsedUnits, closingBank: bank, cycles, balances };
}

function summariseYearOne(sim: SimContext, outcome: YearOutcome): YearOneSummary {
  const generation = sumBy(outcome.balances, (b) => b.generation);
  const selfConsumed = sumBy(outcome.balances, (b) => b.selfConsumed);
  const billWithout = sumBy(sim.baselineCycleBills, (b) => b);
  const billWith = outcome.billWith - outcome.exportIncome;
  const savings = billWithout - billWith;
  return {
    consumption: sumBy(outcome.balances, (b) => b.consumption),
    generation,
    selfConsumed,
    imported: sumBy(outcome.balances, (b) => b.imported),
    exported: sumBy(outcome.balances, (b) => b.exported),
    billWithout,
    billWith,
    savings,
    exportIncome: outcome.exportIncome,
    settledUnits: outcome.settledUnits,
    lapsedUnits: outcome.lapsedUnits,
    selfConsumptionRatio: generation > 0 ? selfConsumed / generation : 0,
    valuePerKwh: generation > 0 ? savings / generation : 0,
    cycles: outcome.cycles,
  };
}

function capitalCosts(sim: SimContext, sizeKw: number): { grossCost: number; centralSubsidy: number; stateSubsidy: number } {
  const { input } = sim;
  const grossCost =
    input.costPerKw !== undefined
      ? input.costPerKw * sizeKw
      : input.installedCostTiers
        ? installedCost(input.installedCostTiers, sizeKw)
        : 0;
  const central = input.centralSubsidy;
  const special = central?.specialCategoryStates?.includes(input.book.stateCode) ?? false;
  const centralSubsidy = central
    ? tieredSubsidy(
        special && central.specialCategoryTiers ? central.specialCategoryTiers : central.tiers,
        sizeKw,
        special ? central.specialCategoryCapInr ?? central.capInr : central.capInr,
      )
    : 0;
  const state = input.book.rooftopSolar.stateSubsidy;
  const stateEligible = input.includeStateSubsidy !== false && state !== undefined && (state.maxKw === undefined || sizeKw <= state.maxKw + 1e-9);
  const stateSubsidy = stateEligible && state ? tieredSubsidy(state.tiers, sizeKw, state.capInr) : 0;
  return { grossCost, centralSubsidy, stateSubsidy };
}

function evaluateSize(sim: SimContext, sizeKw: number, maxFeasibleKw: number): SizeResult {
  const empty = { grossCost: 0, centralSubsidy: 0, stateSubsidy: 0, netCost: 0, cashflows: [], simplePaybackYears: null, discountedPaybackYears: null, npv: null, irr: null, lcoe: null };
  if (sizeKw > maxFeasibleKw + 1e-9) {
    return { sizeKw, feasible: false, infeasibleReason: `Above the ${maxFeasibleKw} kW allowed for this connection`, ...empty };
  }
  const candidates = regimesForCapacity(sim.input.book.rooftopSolar, sizeKw);
  const regime = sim.input.regimeId ? candidates.find((r) => r.id === sim.input.regimeId) : candidates[0];
  if (!regime) {
    return { sizeKw, feasible: false, infeasibleReason: 'No metering regime in this tariff book allows this size', ...empty };
  }

  const { assumptions: a } = sim;
  const costs = capitalCosts(sim, sizeKw);
  const netCost = Math.max(0, costs.grossCost - costs.centralSubsidy - costs.stateSubsidy);
  const baselineTotal = sumBy(sim.baselineCycleBills, (b) => b);
  const cashflows = [-netCost];
  const generationByYear: number[] = [0];
  const extraCosts: number[] = [0];
  let bank = 0;
  let yearOne: YearOneSummary | undefined;

  for (let year = 1; year <= a.years; year += 1) {
    const outcome = simulateYear(sim, sizeKw, regime, (1 - a.degradationPerYear) ** (year - 1), bank);
    bank = outcome.closingBank;
    if (year === 1) yearOne = summariseYearOne(sim, outcome);
    const escalation = (1 + a.tariffEscalationPerYear) ** (year - 1);
    const billSavings = (baselineTotal - outcome.billWith) * escalation;
    const om = year > a.omFreeYears ? a.omPerKwPerYear * sizeKw * (1 + a.omEscalationPerYear) ** (year - 1) : 0;
    const inverter = a.inverterReplacementYear === year ? a.inverterCostPerKw * sizeKw : 0;
    cashflows.push(billSavings + outcome.exportIncome - om - inverter);
    generationByYear.push(sumBy(outcome.balances, (b) => b.generation));
    extraCosts.push(om + inverter);
  }

  const pvGeneration = npv(a.discountRate, generationByYear);
  const pvCosts = netCost + npv(a.discountRate, extraCosts);
  return {
    sizeKw,
    feasible: true,
    regimeId: regime.id,
    regimeType: regime.type,
    ...costs,
    netCost,
    ...(yearOne ? { year1: yearOne } : {}),
    cashflows,
    simplePaybackYears: paybackYears(cashflows),
    discountedPaybackYears: paybackYears(cashflows, a.discountRate),
    npv: npv(a.discountRate, cashflows),
    irr: irr(cashflows),
    lcoe: pvGeneration > 0 ? pvCosts / pvGeneration : null,
  };
}

/** The largest allowed size, and the limit(s) that actually set it. */
function capacityLimits(input: SolarSimulationInput): { maxKw: number; limits: string[] } {
  const rule = input.book.rooftopSolar.capacityLimit;
  const candidates: { kw: number; reason: string }[] = [{ kw: 10, reason: 'the 10 kW this simulator covers for homes' }];
  if (rule.maxPercentOfSanctionedLoad !== undefined) {
    const kw = (input.sanctionedLoadKw * rule.maxPercentOfSanctionedLoad) / 100;
    const share = rule.maxPercentOfSanctionedLoad === 100 ? 'your' : `${rule.maxPercentOfSanctionedLoad}% of your`;
    candidates.push({ kw, reason: `${share} ${input.sanctionedLoadKw} kW sanctioned load` });
  }
  if (rule.maxKw !== undefined) candidates.push({ kw: rule.maxKw, reason: `the ${rule.maxKw} kW regulatory cap` });
  if (input.roofLimitKw !== undefined) candidates.push({ kw: input.roofLimitKw, reason: `roof space for ${input.roofLimitKw} kW` });
  const maxKw = Math.min(...candidates.map((c) => c.kw));
  return { maxKw, limits: candidates.filter((c) => Math.abs(c.kw - maxKw) < 1e-9).map((c) => c.reason) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function assertSimulationInput(input: SolarSimulationInput): void {
  if (input.monthlyConsumptionKwh.length !== 12) throw new RangeError('monthlyConsumptionKwh needs 12 values (January first)');
  if (input.monthlyConsumptionKwh.some((v) => !Number.isFinite(v) || v < 0)) throw new RangeError('monthly consumption must be ≥ 0');
  if (input.sizesKw?.some((s) => !Number.isFinite(s) || s <= 0)) throw new RangeError('sizesKw must be positive');
}

function buildContext(input: SolarSimulationInput): SimContext {
  const category = input.categoryId ? input.book.categories.find((c) => c.id === input.categoryId) : input.book.categories[0];
  if (!category) throw new RangeError(`Unknown category ${input.categoryId}`);
  const ctx: BillContext = {
    phase: input.phase ?? 'single',
    area: input.area ?? 'urban',
    loadKw: input.sanctionedLoadKw,
    flags: new Set(input.flags ?? []),
  };
  const baseBillInput: Omit<BillInput, 'units'> = {
    sanctionedLoadKw: input.sanctionedLoadKw,
    categoryId: category.id,
    ...(input.utilityId ? { utilityId: input.utilityId } : {}),
    ...(input.phase ? { phase: input.phase } : {}),
    ...(input.area ? { area: input.area } : {}),
    ...(input.flags ? { flags: input.flags } : {}),
    ...(input.billSubsidies ? { subsidies: input.billSubsidies } : {}),
  };
  const cycles = buildCycles(category.billingCycle === 'bimonthly' ? 2 : 1);
  const loadShape = resolveLoadProfile(input.loadProfile);
  const todSplit = makeTodSplitter(category, ctx);
  const baselineCycleBills = cycles.map((cycle) => {
    const units = sumBy(cycle.calendarMonths, (m) => input.monthlyConsumptionKwh[m] ?? 0);
    const byHour = loadShape.map((share) =>
      sumBy(cycle.calendarMonths, (m) => (input.monthlyConsumptionKwh[m] ?? 0) * share),
    );
    const todUnits = todSplit?.(byHour);
    return computeBill(input.book, { ...baseBillInput, units, ...(todUnits ? { todUnits } : {}) }).total;
  });
  return {
    input,
    category,
    ctx,
    cycles,
    genShapes: Array.from({ length: 12 }, (_, m) => hourlyGenerationShape(input.resource.lat, input.resource.lon, m)),
    loadShape,
    assumptions: resolveAssumptions(input.assumptions),
    todSplit,
    baselineCycleBills,
    baseBillInput,
  };
}

/**
 * Right-size a rooftop system and compute payback for each candidate size, billing
 * every cycle through the real tariff (slabs, fixed charges, ToD, net-metering bank
 * and settlement) rather than a single average tariff.
 */
export function simulateSolar(input: SolarSimulationInput): SolarSimulationResult {
  assertSimulationInput(input);
  const sim = buildContext(input);
  const { maxKw, limits } = capacityLimits(input);
  const defaultSizes = Array.from({ length: 10 }, (_, i) => i + 1).filter((s) => s <= maxKw + 1e-9);
  // Also try the largest allowed size itself (to the half kW), e.g. 2.5 kW under a 2.5 kW cap.
  const largest = Math.floor(maxKw * 2) / 2;
  if (largest >= 0.5 && largest > (defaultSizes.at(-1) ?? 0)) defaultSizes.push(largest);
  const sizes = [...(input.sizesKw ?? defaultSizes)].toSorted((a, b) => a - b).map((s) => evaluateSize(sim, s, maxKw));

  const annualConsumption = sumBy(input.monthlyConsumptionKwh, (v) => v);
  const annualBillWithout = sumBy(sim.baselineCycleBills, (b) => b);
  const averageTariff = annualConsumption > 0 ? annualBillWithout / annualConsumption : 0;
  const { recommended, rationale } = recommend(sizes, sim, averageTariff, limits);

  return {
    utilityId: input.utilityId ?? input.book.utilities[0]?.id ?? '',
    bookId: input.book.bookId,
    financialYear: input.book.financialYear,
    resourceId: input.resource.id,
    annualConsumption,
    annualBillWithout,
    averageTariff,
    maxFeasibleKw: maxKw,
    limits,
    sizes,
    recommended,
    rationale,
    assumptions: sim.assumptions,
    warnings: simulationWarnings(sim, input),
  };
}

function simulationWarnings(sim: SimContext, input: SolarSimulationInput): string[] {
  const warnings: string[] = [];
  const optIn = sim.category.subsidies.filter((s) => s.optIn);
  if (optIn.length > 0 && input.billSubsidies?.apply !== true) {
    warnings.push(
      `Opt-in bill subsidies (${optIn.map((s) => s.name).join(', ')}) are not applied. If your household is enrolled, solar saves you less than shown.`,
    );
  }
  if (input.billSubsidies?.apply === false && sim.category.subsidies.some((s) => !s.optIn)) {
    warnings.push('Automatic government subsidies are switched off, so bills (and savings) are higher than households actually see.');
  }
  if (input.centralSubsidy === undefined) warnings.push('No central subsidy scheme was passed; costs are shown without PM Surya Ghar CFA.');
  if (input.costPerKw === undefined && !input.installedCostTiers) warnings.push('No installed cost given; cost and payback are zero.');
  if (input.book.status !== 'complete') {
    warnings.push(`This tariff data (${input.book.bookId}, FY ${input.book.financialYear}) has ${input.book.gaps.length} known gap(s) listed with its sources.`);
  }
  return warnings;
}

const inr = (value: number): string => `₹${Math.round(value).toLocaleString('en-IN')}`;

function recommend(
  sizes: readonly SizeResult[],
  sim: SimContext,
  averageTariff: number,
  limits: readonly string[],
): { recommended: SizeResult | null; rationale: string[] } {
  const feasible = sizes.filter((s) => s.feasible && s.npv !== null);
  const rationale: string[] = [];
  const years = sim.assumptions.years;
  const rate = Math.round(sim.assumptions.discountRate * 1000) / 10;
  const best = feasible.reduce<SizeResult | null>((top, s) => (top === null || (s.npv ?? -Infinity) > (top.npv ?? -Infinity) ? s : top), null);

  rationale.push(
    `Each unit you buy from the grid now costs you ₹${averageTariff.toFixed(2)} on average, ${inr(sumBy(sim.baselineCycleBills, (b) => b))} a year in bills.`,
  );
  if (!best || (best.npv ?? 0) <= 0) {
    rationale.push(`No size pays for itself within ${years} years at a ${rate}% discount rate with these tariffs and costs.`);
    if (averageTariff < 4) rationale.push('Homes that use little electricity pay low slab rates (or get free units), so each unit of solar saves little.');
    return { recommended: null, rationale };
  }

  const payback = best.simplePaybackYears === null ? 'though it does not fully pay back' : `and pays for itself in ${best.simplePaybackYears.toFixed(1)} years`;
  rationale.push(`${best.sizeKw} kW leaves you the most money over ${years} years (${inr(best.npv ?? 0)} in today's money, after the system's cost) ${payback}.`);
  const next = feasible.find((s) => s.sizeKw > best.sizeKw);
  if (next?.year1 && best.year1) {
    const extraKwh = next.year1.generation - best.year1.generation;
    const extraValue = next.year1.savings - best.year1.savings;
    if (extraKwh > 0) {
      rationale.push(
        `A bigger ${next.sizeKw} kW system would make ${Math.round(extraKwh)} more units a year, but they are worth only ₹${(extraValue / extraKwh).toFixed(2)} each: you would export most of them at the utility's buy-back rate instead of using them yourself.`,
      );
    }
  } else if (limits.length > 0) {
    rationale.push(`It is also the largest system you can install, set by ${limits.join(' and ')}.`);
  }
  if (best.year1 && best.year1.lapsedUnits > 0) {
    rationale.push(`At this size ${Math.round(best.year1.lapsedUnits)} exported units a year go unpaid when the meter's bank is settled.`);
  }
  return { recommended: best, rationale };
}
