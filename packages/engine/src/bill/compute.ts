import type { Category, TariffBook } from '@openbijli/data';
import { roundPaise, sum } from '../money.js';
import { computeCharges, type SolarChargeInput } from './charges.js';
import { resolveCitations } from './context.js';
import { TariffDataError, energyForFirstUnits, priceEnergy, selectSchedule } from './energy.js';
import { computeFixed, selectFixedRule } from './fixed.js';
import { selectRegime, settleSolarCycle } from './solar.js';
import { evaluateSubsidy, type CoreTotals } from './subsidy.js';
import { decideTod, priceTod } from './tod.js';
import type { Bill, BillContext, BillInput, BillLine, SolarCycleResult, SubsidyOptions } from './types.js';

interface CoreBill {
  readonly scheduleId: string;
  readonly lines: readonly BillLine[];
  readonly totals: CoreTotals;
}

interface CoreParams {
  readonly book: TariffBook;
  readonly category: Category;
  readonly ctx: BillContext;
  readonly utilityId: string;
  readonly billedUnits: number;
  readonly monthsInCycle: number;
  readonly todUnits?: Readonly<Record<string, number>>;
  readonly todScale: number;
  readonly solar: SolarChargeInput;
}

function fmtUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(2);
}

/** Energy, fixed, ToD and additional charges for a number of billed units. */
function computeCore(p: CoreParams): CoreBill {
  const { book, category, ctx } = p;
  const schedule = selectSchedule(category.energy.schedules, p.billedUnits, ctx);
  const energyCite = resolveCitations(book, category.energy.cite);
  const segments = priceEnergy(schedule, p.billedUnits);

  const energyLines: BillLine[] = segments.map((s, index) => ({
    id: `energy-${index + 1}`,
    kind: 'energy',
    label:
      schedule.method === 'whole'
        ? `Energy: all ${fmtUnits(s.units)} kWh at one slab rate`
        : `Energy ${fmtUnits(s.fromUnits)}–${fmtUnits(s.toUnits)} kWh`,
    amount: roundPaise(s.amount),
    quantity: s.units,
    rate: s.rate,
    unit: 'kWh',
    verification: category.energy.verification,
    cite: energyCite,
  }));
  const energy = sum(energyLines.map((l) => l.amount));

  const fixedRule = selectFixedRule(category.fixed.rules, ctx);
  const fixedResult = computeFixed(fixedRule, ctx, p.billedUnits, p.monthsInCycle);
  const fixedLine: BillLine = {
    id: 'fixed',
    kind: 'fixed',
    label: fixedRule.label ?? 'Fixed charge',
    amount: roundPaise(fixedResult.amount),
    detail: fixedResult.detail,
    verification: category.fixed.verification,
    cite: resolveCitations(book, category.fixed.cite),
  };

  const todLines: BillLine[] = [];
  if (category.tod && p.todUnits && p.billedUnits > 0) {
    const averageRate = energy / p.billedUnits;
    for (const charge of priceTod(category.tod, p.todUnits, averageRate, p.todScale)) {
      todLines.push({
        id: `tod-${charge.period.id}`,
        kind: 'tod',
        label: `Time-of-day: ${charge.period.name}`,
        amount: roundPaise(charge.amount),
        quantity: charge.units,
        rate: charge.ratePerKwh,
        unit: 'kWh',
        verification: category.tod.verification,
        cite: resolveCitations(book, category.tod.cite),
      });
    }
  }
  const tod = sum(todLines.map((l) => l.amount));

  const chargeLines: BillLine[] = computeCharges(
    category.charges,
    ctx,
    p.utilityId,
    { energy, fixed: fixedLine.amount, tod },
    p.billedUnits,
    p.monthsInCycle,
    p.solar,
  ).map(({ charge, amount, detail }) => ({
    id: charge.id,
    kind: 'charge',
    label: charge.name,
    amount: roundPaise(amount),
    detail,
    variable: charge.variable,
    verification: charge.verification,
    cite: resolveCitations(book, charge.cite),
  }));

  return {
    scheduleId: schedule.id,
    lines: [...energyLines, fixedLine, ...todLines, ...chargeLines],
    totals: { energy, fixed: fixedLine.amount, tod, charges: sum(chargeLines.map((l) => l.amount)) },
  };
}

function assertInput(input: BillInput): void {
  if (!Number.isFinite(input.units) || input.units < 0) throw new RangeError(`units must be a finite number ≥ 0 (got ${input.units})`);
  if (!Number.isFinite(input.sanctionedLoadKw) || input.sanctionedLoadKw <= 0) {
    throw new RangeError(`sanctionedLoadKw must be > 0 (got ${input.sanctionedLoadKw})`);
  }
  for (const [period, units] of Object.entries(input.todUnits ?? {})) {
    if (!Number.isFinite(units) || units < 0) throw new RangeError(`todUnits.${period} must be ≥ 0`);
  }
  if (input.solar) {
    const { exportedUnits, generatedUnits, openingBankUnits, capacityKw } = input.solar;
    if (!Number.isFinite(exportedUnits) || exportedUnits < 0) throw new RangeError('solar.exportedUnits must be a finite number ≥ 0');
    for (const [name, value] of Object.entries({ generatedUnits, openingBankUnits, capacityKw })) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`solar.${name} must be ≥ 0`);
    }
  }
}

function pickCategory(book: TariffBook, categoryId?: string): Category {
  const category = categoryId ? book.categories.find((c) => c.id === categoryId) : book.categories[0];
  if (!category) {
    throw new TariffDataError(`Unknown category "${categoryId}" in ${book.bookId}. Available: ${book.categories.map((c) => c.id).join(', ')}`);
  }
  return category;
}

function pickUtility(book: TariffBook, utilityId?: string): string {
  const id = utilityId ?? book.utilities[0]?.id;
  if (!id || !book.utilities.some((u) => u.id === id)) {
    throw new TariffDataError(`Utility "${utilityId}" is not covered by book ${book.bookId}`);
  }
  return id;
}

function solarLines(result: SolarCycleResult, regimeCite: BillLine['cite'], verification: BillLine['verification']): BillLine[] {
  const lines: BillLine[] = [];
  if (result.exportCredit > 0) {
    lines.push({
      id: 'solar-export-credit',
      kind: 'solar',
      label: result.type === 'gross_metering' ? 'Solar generation sold (gross metering)' : 'Solar export credit (net billing)',
      amount: -roundPaise(result.exportCredit),
      rate: result.exportRate ?? 0,
      unit: 'kWh',
      verification,
      cite: regimeCite,
    });
  }
  if (result.settlementPayout > 0) {
    lines.push({
      id: 'solar-settlement',
      kind: 'solar',
      label: 'Net-metering surplus settled at export rate',
      amount: -roundPaise(result.settlementPayout),
      quantity: result.settledUnits,
      rate: result.exportRate ?? 0,
      unit: 'kWh',
      verification,
      cite: regimeCite,
    });
  }
  return lines;
}

/** Government bill subsidies as credit lines, never taking the pre-subsidy total below zero. */
function computeSubsidyLines(p: CoreParams, core: CoreBill, options: SubsidyOptions, warnings: string[]): BillLine[] {
  if (options.apply === false) return [];
  const { book, category, ctx, billedUnits, utilityId } = p;
  const schedule = selectSchedule(category.energy.schedules, billedUnits, ctx);
  const lines: BillLine[] = [];
  let remaining = sum(Object.values(core.totals));

  for (const subsidy of category.subsidies) {
    if (subsidy.utilities && !subsidy.utilities.includes(utilityId)) continue;
    if (options.include && !options.include.includes(subsidy.id)) continue;
    if (subsidy.optIn && options.apply === 'automatic') {
      warnings.push(`${subsidy.name} needs registration, so it is not included. Include it only if the household is enrolled.`);
      continue;
    }
    const result = evaluateSubsidy(subsidy, {
      billedUnits,
      totals: core.totals,
      options,
      totalsFor: (units) => computeCore({ ...p, billedUnits: units, todScale: 0 }).totals,
      energyForFirst: (units) => energyForFirstUnits(schedule, billedUnits, units),
      energyAt: (schedules) => {
        // A payable table that does not cover this consumer (e.g. urban-only) means no credit.
        try {
          return sum(priceEnergy(selectSchedule(schedules, billedUnits, ctx), billedUnits).map((s) => roundPaise(s.amount)));
        } catch (error: unknown) {
          if (error instanceof TariffDataError) return core.totals.energy;
          throw error;
        }
      },
    });
    if (!result) continue;
    if (result.warning) warnings.push(result.warning);
    const credit = Math.min(result.credit, Math.max(0, remaining));
    if (credit <= 0) continue;
    remaining -= credit;
    lines.push({
      id: `subsidy-${subsidy.id}`,
      kind: 'subsidy',
      label: `${subsidy.name} (${subsidy.authority})`,
      amount: -roundPaise(credit),
      detail: result.detail,
      verification: subsidy.verification,
      cite: resolveCitations(book, subsidy.cite),
    });
    if (subsidy.optIn) warnings.push(`${subsidy.name} requires registration; applied on the assumption the household is enrolled.`);
  }
  return lines;
}

/**
 * Compute one billing cycle's bill from a tariff book.
 *
 * Pipeline: solar netting -> energy slabs -> fixed charge -> ToD -> additional charges
 * (in file order) -> government subsidies -> solar credits. Every line is rounded to
 * paise and carries the citations of the data it came from.
 */
export function computeBill(book: TariffBook, input: BillInput): Bill {
  assertInput(input);
  const category = pickCategory(book, input.categoryId);
  const utilityId = pickUtility(book, input.utilityId);
  const monthsInCycle = category.billingCycle === 'bimonthly' ? 2 : 1;
  const warnings: string[] = [];

  const flags = new Set(input.flags ?? []);
  if (input.solar) flags.add('solar_prosumer');
  const ctx: BillContext = { phase: input.phase ?? 'single', area: input.area ?? 'urban', loadKw: input.sanctionedLoadKw, flags };

  let solar: SolarCycleResult | undefined;
  let solarCreditLines: BillLine[] = [];
  let billedUnits = input.units;
  if (input.solar) {
    const regime = selectRegime(book.rooftopSolar, input.solar.regimeId);
    solar = settleSolarCycle(regime, input.units, input.solar, monthsInCycle);
    billedUnits = solar.billedUnits;
    if (solar.exportRate === null) warnings.push(`Export rate for ${regime.label} is not published in this book; exports credited at ₹0.`);
    if (input.solar.centralSubsidy === undefined && regime.exportRate.withCentralSubsidy) {
      warnings.push(`${regime.label} pays a lower export rate to systems that took the central subsidy; pass solar.centralSubsidy to choose.`);
    }
    if (regime.exportRate.variable) warnings.push(`Export rate for ${regime.label} varies (${regime.exportRate.basis}); the book's latest value is used.`);
    solarCreditLines = solarLines(solar, resolveCitations(book, regime.cite), regime.verification);
  }

  const decision = decideTod(category.tod, ctx, input.todUnits, billedUnits);
  if (!decision.apply && decision.warning) warnings.push(decision.warning);
  let todScale = input.units > 0 ? billedUnits / input.units : 0;
  if (decision.apply && input.todUnits) {
    const splitTotal = sum(Object.values(input.todUnits));
    if (splitTotal > input.units + 1e-6) {
      warnings.push(`ToD split (${fmtUnits(splitTotal)} kWh) exceeds consumption (${fmtUnits(input.units)} kWh); scaled down.`);
      todScale *= input.units / splitTotal;
    }
  }

  const coreParams: CoreParams = {
    book,
    category,
    ctx,
    utilityId,
    billedUnits,
    monthsInCycle,
    todScale,
    solar: {
      capacityKw: input.solar?.capacityKw ?? 0,
      ...(input.solar?.generatedUnits !== undefined ? { generatedUnits: input.solar.generatedUnits } : {}),
    },
    ...(decision.apply && input.todUnits ? { todUnits: input.todUnits } : {}),
  };
  const core = computeCore(coreParams);
  if (input.solar && input.solar.generatedUnits === undefined && category.charges.some((c) => c.kind === 'per_solar_kwh')) {
    warnings.push('This tariff charges per kWh of solar generation; pass solar.generatedUnits to include it.');
  }

  const subsidyLines = computeSubsidyLines(coreParams, core, input.subsidies ?? { apply: 'automatic' }, warnings);

  const lines = [...core.lines, ...subsidyLines, ...solarCreditLines];
  const totals = {
    energy: roundPaise(core.totals.energy),
    fixed: roundPaise(core.totals.fixed),
    tod: roundPaise(core.totals.tod),
    charges: roundPaise(core.totals.charges),
    subsidies: roundPaise(sum(subsidyLines.map((l) => l.amount))),
    solar: roundPaise(sum(solarCreditLines.map((l) => l.amount))),
  };
  if (decision.apply && category.tod && input.todUnits) {
    const known = new Set(category.tod.periods.map((p) => p.id));
    const unknown = Object.keys(input.todUnits).filter((k) => !known.has(k));
    if (unknown.length > 0) warnings.push(`Unknown ToD period(s) ignored: ${unknown.join(', ')}. Known: ${[...known].join(', ')}.`);
  }
  const total = roundPaise(sum(lines.map((l) => l.amount)));

  for (const line of lines) {
    // An unverified placeholder gets its own warning below; saying it "varies" too is noise.
    if (line.variable && line.verification !== 'unverified') warnings.push(`${line.label} changes month to month; the latest notified value in the dataset is used.`);
  }
  const unverified = [...new Set(lines.filter((l) => l.verification === 'unverified').map((l) => l.label))];
  if (unverified.length > 0) warnings.push(`Unverified data used for: ${unverified.join(', ')}.`);
  if (book.status !== 'complete') {
    warnings.push(`This tariff data (${book.bookId}, FY ${book.financialYear}) has ${book.gaps.length} known gap(s) listed with its sources.`);
  }

  return {
    bookId: book.bookId,
    financialYear: book.financialYear,
    utilityId,
    categoryId: category.id,
    billingCycle: category.billingCycle,
    monthsInCycle,
    consumptionUnits: input.units,
    billedUnits,
    scheduleId: core.scheduleId,
    lines,
    totals,
    total,
    payable: Math.round(total),
    ...(solar ? { solar } : {}),
    warnings: [...new Set(warnings)],
  };
}
