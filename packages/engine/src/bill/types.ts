import type { ContextFlag, Verification } from '@open-tariff-india/data';

export type Phase = 'single' | 'three';
export type Area = 'urban' | 'rural';

export interface BillContext {
  readonly phase: Phase;
  readonly area: Area;
  readonly loadKw: number;
  readonly flags: ReadonlySet<ContextFlag>;
}

export interface SubsidyOptions {
  /**
   * Which government bill subsidies to apply.
   *   'automatic' (default): schemes every eligible consumer gets without registering
   *               (e.g. Tamil Nadu's free units), so the bill matches what households pay.
   *   true:       also opt-in schemes (Gruha Jyothi etc.); assumes the household is enrolled.
   *   false:      none; the regulator's tariff as approved.
   */
  readonly apply: boolean | 'automatic';
  /** Household baseline for entitlement schemes (Karnataka Gruha Jyothi), kWh per cycle. */
  readonly baselineUnits?: number;
  /** Only apply these subsidy ids (default: all in the category). */
  readonly include?: readonly string[];
}

export interface SolarCycleInput {
  /** Regime id from the book; defaults to the book's default regime. */
  readonly regimeId?: string;
  /** kWh exported to the grid in this cycle (net/net-billing meters). */
  readonly exportedUnits: number;
  /** kWh generated in this cycle; required for gross metering. */
  readonly generatedUnits?: number;
  /** kWh carried in the net-metering bank from earlier cycles. */
  readonly openingBankUnits?: number;
  /** True when this bill closes the settlement period (e.g. March for FY settlement). */
  readonly settle?: boolean;
  /** Installed solar capacity (kWp); selects subsidised export-rate bands and per-kW solar charges. */
  readonly capacityKw?: number;
  /** True if the system took the central capital subsidy (PM Surya Ghar). */
  readonly centralSubsidy?: boolean;
}

export interface BillInput {
  /** Utility within the book, used for utility-specific charges. Default: the book's first utility. */
  readonly utilityId?: string;
  /** Tariff category id. Default: the book's first category. */
  readonly categoryId?: string;
  /** kWh imported from the grid in this billing cycle (whole cycle, not per month). */
  readonly units: number;
  readonly sanctionedLoadKw: number;
  readonly phase?: Phase;
  readonly area?: Area;
  readonly flags?: readonly ContextFlag[];
  /** Imported kWh per ToD period id. Units not listed are billed at the normal rate. */
  readonly todUnits?: Readonly<Record<string, number>>;
  readonly subsidies?: SubsidyOptions;
  readonly solar?: SolarCycleInput;
}

export type LineKind = 'energy' | 'fixed' | 'tod' | 'charge' | 'subsidy' | 'solar';

export interface ResolvedCitation {
  readonly ref: string;
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  readonly page?: number | string;
  readonly quote?: string;
}

export interface BillLine {
  readonly id: string;
  readonly kind: LineKind;
  readonly label: string;
  readonly amount: number;
  readonly quantity?: number;
  readonly rate?: number;
  readonly unit?: string;
  readonly detail?: string;
  readonly variable?: boolean;
  readonly verification: Verification;
  readonly cite: readonly ResolvedCitation[];
}

export interface SolarCycleResult {
  readonly regimeId: string;
  readonly type: 'net_metering' | 'net_billing' | 'gross_metering';
  readonly importedUnits: number;
  readonly exportedUnits: number;
  readonly openingBankUnits: number;
  readonly closingBankUnits: number;
  readonly billedUnits: number;
  readonly exportRate: number | null;
  /** INR credited for exports this cycle (net billing / gross metering). */
  readonly exportCredit: number;
  /** kWh settled from the bank this cycle and the INR paid for them. */
  readonly settledUnits: number;
  readonly settlementPayout: number;
}

export interface BillTotals {
  readonly energy: number;
  readonly fixed: number;
  readonly tod: number;
  readonly charges: number;
  readonly subsidies: number;
  readonly solar: number;
}

export interface Bill {
  readonly bookId: string;
  readonly financialYear: string;
  readonly utilityId: string;
  readonly categoryId: string;
  readonly billingCycle: 'monthly' | 'bimonthly';
  readonly monthsInCycle: number;
  /** kWh imported from the grid. */
  readonly consumptionUnits: number;
  /** kWh the energy charge was computed on (after net metering). */
  readonly billedUnits: number;
  readonly scheduleId: string;
  readonly lines: readonly BillLine[];
  readonly totals: BillTotals;
  /** Sum of lines in INR (can be negative under net billing: a credit carried forward). */
  readonly total: number;
  /** Total rounded to the rupee, as most bills show. */
  readonly payable: number;
  readonly solar?: SolarCycleResult;
  readonly warnings: readonly string[];
}
