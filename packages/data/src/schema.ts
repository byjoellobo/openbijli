/**
 * The OpenBijli data model.
 *
 * One "tariff book" = one regulator's retail tariff for one financial year, which may
 * apply to several utilities (e.g. KERC's uniform tariff covers BESCOM and MESCOM).
 * Every number that changes a bill carries a citation into the book's `sources`
 * registry and a verification level, so outputs can say where each rupee came from.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a lowercase slug (a-z, 0-9, -)');
const isoDate = z.iso.date();
/** Only http(s) links: source URLs end up in href attributes. */
const httpUrl = z.url({ protocol: /^https?$/ });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'must be HH:MM (24h)');

export const financialYearSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'must look like 2026-27')
  .refine((fy) => {
    const start = Number(fy.slice(0, 4));
    const end = Number(fy.slice(5, 7));
    return (start + 1) % 100 === end;
  }, 'second year must follow the first (e.g. 2026-27)');

/* ------------------------------------------------------------------ sources */

export const SourceTypeSchema = z.enum([
  'regulator_order',
  'regulation',
  'gazette',
  'utility_page',
  'government_page',
  'news',
  'dataset',
  'other',
]);

export const SourceSchema = z.strictObject({
  title: z.string().min(3),
  publisher: z.string().min(2),
  url: httpUrl,
  type: SourceTypeSchema,
  date: isoDate.optional(),
  accessed: isoDate,
  /** SHA-256 of the exact PDF/page bytes that were read; lets reviewers detect silent re-uploads. */
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  archiveUrl: httpUrl.optional(),
  note: z.string().optional(),
});

export const CitationSchema = z.strictObject({
  ref: slug,
  page: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  quote: z.string().optional(),
});

/**
 * verified   - checked against a primary source (order, regulation, gazette, utility page)
 * secondary  - taken from a secondary source (news, aggregator); needs a primary check
 * unverified - a placeholder or assumption; engines surface a warning when it is used
 */
export const VerificationSchema = z.enum(['verified', 'secondary', 'unverified']);

const cited = {
  cite: z.array(CitationSchema).min(1),
  verification: VerificationSchema,
};

/* --------------------------------------------------------------- conditions */

export const ContextFlagSchema = z.enum([
  'smart_meter',
  'prepaid',
  'digital_payment',
  'prompt_payment',
  'solar_prosumer',
]);

export const ConditionSchema = z.strictObject({
  phase: z.enum(['single', 'three']).optional(),
  area: z.enum(['urban', 'rural']).optional(),
  minLoadKw: z.number().min(0).optional(),
  maxLoadKw: z.number().positive().optional(),
  /** All listed flags must be present in the bill context. */
  flags: z.array(ContextFlagSchema).optional(),
});

/* ----------------------------------------------------------- energy charges */

export const SlabSchema = z.strictObject({
  /** Upper bound in kWh per billing cycle (inclusive). `null` = open-ended last slab. */
  upTo: z.number().positive().nullable(),
  /** INR per kWh. */
  rate: z.number().min(0),
});

function checkBands(
  bands: readonly { upTo: number | null }[],
  ctx: z.RefinementCtx,
  label: string,
): void {
  let previous = 0;
  bands.forEach((band, index) => {
    const isLast = index === bands.length - 1;
    if (isLast && band.upTo !== null) {
      ctx.addIssue({ code: 'custom', message: `${label}: last band must be open-ended (upTo: null)` });
    }
    if (!isLast && band.upTo === null) {
      ctx.addIssue({ code: 'custom', message: `${label}: only the last band may be open-ended` });
    }
    if (band.upTo !== null) {
      if (band.upTo <= previous) {
        ctx.addIssue({ code: 'custom', message: `${label}: band bounds must be strictly ascending` });
      }
      previous = band.upTo;
    }
  });
}

export const EnergyScheduleSchema = z
  .object({
    id: slug,
    label: z.string().optional(),
    /**
     * Which consumers this table applies to. Units are per billing cycle.
     * A schedule matches when units > aboveUnits and units <= upToUnits.
     * The engine picks the FIRST matching schedule, so order matters.
     */
    when: ConditionSchema.extend({
      aboveUnits: z.number().min(0).optional(),
      upToUnits: z.number().positive().optional(),
    }).optional(),
    /**
     * telescopic: each block of units is charged at its own slab rate.
     * whole: once total consumption falls in a slab, ALL units are charged at that slab's rate.
     */
    method: z.enum(['telescopic', 'whole']),
    slabs: z.array(SlabSchema).min(1),
  })
  .superRefine((schedule, ctx) => checkBands(schedule.slabs, ctx, `energy schedule ${schedule.id}`));

export const EnergyChargeSchema = z.strictObject({
  schedules: z.array(EnergyScheduleSchema).min(1),
  note: z.string().optional(),
  ...cited,
});

/* ------------------------------------------------------------ fixed charges */

export const FixedBandSchema = z.strictObject({
  upTo: z.number().positive().nullable(),
  amount: z.number().min(0),
  per: z.enum(['connection', 'kw']),
});

export const FixedChargeRuleSchema = z
  .object({
    id: slug,
    label: z.string().optional(),
    when: ConditionSchema.optional(),
    /** What selects the band: nothing, the sanctioned load, or the consumption. */
    bandBy: z.enum(['none', 'load_kw', 'units']),
    /** For units banding: compare bands against cycle units or against the monthly average. */
    unitsBasis: z.enum(['cycle', 'monthly_average']).optional(),
    /** telescopic only makes sense for bandBy load_kw with per-kW bands. */
    method: z.enum(['whole', 'telescopic']),
    bands: z.array(FixedBandSchema).min(1),
    /** month: amount is per month (doubled on bimonthly bills). cycle: amount is per bill. */
    period: z.enum(['month', 'cycle']),
    /** ceil: up to whole kW; ceil_half: up to 0.5 kW; round_quarter: to the nearest 0.25 kW. */
    loadRounding: z.enum(['none', 'ceil', 'ceil_half', 'round_quarter']),
    minimumKw: z.number().positive().optional(),
  })
  .superRefine((rule, ctx) => checkBands(rule.bands, ctx, `fixed rule ${rule.id}`));

export const FixedChargeSchema = z.strictObject({
  rules: z.array(FixedChargeRuleSchema).min(1),
  note: z.string().optional(),
  ...cited,
});

/* ------------------------------------------------------- additional charges */

const chargeBase = {
  id: slug,
  name: z.string().min(2),
  /** Restrict to some utilities in the book (e.g. Delhi PPAC differs per discom). */
  utilities: z.array(slug).optional(),
  appliesIf: ConditionSchema.optional(),
  /** Apply only when billed units in the cycle satisfy aboveUnits < units <= upToUnits. */
  whenUnits: z
    .object({ aboveUnits: z.number().min(0).optional(), upToUnits: z.number().positive().optional() })
    .optional(),
  /** True for charges that move during the year (FPPCA, FAC, PPAC). */
  variable: z.boolean(),
  asOf: isoDate.optional(),
  note: z.string().optional(),
  ...cited,
};

export const AdditionalChargeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('per_kwh'), rate: z.number(), ...chargeBase }),
  z.strictObject({
    kind: z.literal('percent'),
    percent: z.number(),
    /** Line ids this percentage applies to: energy, fixed, tod, or ids of EARLIER charges. */
    of: z.array(z.string().min(1)).min(1),
    ...chargeBase,
  }),
  z.strictObject({
    kind: z.literal('flat'),
    amount: z.number(),
    period: z.enum(['month', 'cycle']),
    ...chargeBase,
  }),
  /** Per kW of installed rooftop solar, e.g. KERC's Rs 25/kW fixed-charge rebate (negative amount). */
  z.strictObject({
    kind: z.literal('per_solar_kw'),
    amount: z.number(),
    period: z.enum(['month', 'cycle']),
    maxKw: z.number().positive().optional(),
    ...chargeBase,
  }),
  /**
   * Per kWh of solar GENERATION, e.g. Tamil Nadu's network charge on rooftop solar.
   * Capacity band: minSolarKw < capacity <= maxSolarKw (lower bound exclusive).
   */
  z.strictObject({
    kind: z.literal('per_solar_kwh'),
    rate: z.number(),
    minSolarKw: z.number().min(0).optional(),
    maxSolarKw: z.number().positive().optional(),
    ...chargeBase,
  }),
  /** A flat amount chosen by consumption band (e.g. Telangana customer charges). */
  z.strictObject({
    kind: z.literal('flat_by_units'),
    bands: z.array(z.strictObject({ upTo: z.number().positive().nullable(), amount: z.number() })).min(1),
    unitsBasis: z.enum(['cycle', 'monthly_average']),
    period: z.enum(['month', 'cycle']),
    ...chargeBase,
  }),
]);

/* -------------------------------------------------------------- time of day */

export const TodPeriodSchema = z.strictObject({
  id: slug,
  name: z.string(),
  /** Clock windows in IST. A window may wrap midnight (22:00 to 06:00). */
  windows: z.array(z.strictObject({ from: hhmm, to: hhmm })).min(1),
  adjustment: z.discriminatedUnion('type', [
    /** e.g. -20 = 20% rebate on the normal energy rate for units in this window. */
    z.strictObject({ type: z.literal('percent_of_energy_rate'), value: z.number() }),
    /** e.g. -0.8 = Rs 0.80/kWh rebate. */
    z.strictObject({ type: z.literal('per_kwh'), value: z.number() }),
  ]),
});

export const TodSchema = z.strictObject({
  applicability: z.string().min(3),
  appliesIf: ConditionSchema.optional(),
  /** ToD applies only when billed units in the cycle exceed this (e.g. Kerala: 250/month = 500/bimonthly). */
  aboveUnits: z.number().min(0).optional(),
  /** If true, ToD applies automatically to consumers meeting appliesIf. */
  mandatory: z.boolean(),
  periods: z.array(TodPeriodSchema).min(1),
  note: z.string().optional(),
  ...cited,
});

/* ---------------------------------------------------------------- subsidies */

/** Which bill lines a subsidy pays for. */
export const CoversSchema = z.enum(['total', 'energy', 'energy_and_fixed']);

const subsidyBase = {
  id: slug,
  name: z.string().min(2),
  authority: z.string().min(2),
  /** Requires registration (e.g. Gruha Jyothi, Telangana Gruha Jyothi). */
  optIn: z.boolean(),
  eligibility: z.string().min(3),
  /** How the scheme treats rooftop solar prosumers, if known. */
  solarInteraction: z.string().optional(),
  utilities: z.array(slug).optional(),
  ...cited,
};

export const SubsidySchema = z.discriminatedUnion('rule', [
  /** Bill is zero when units <= threshold; above it the consumer pays the full bill. */
  z.strictObject({ rule: z.literal('zero_bill_up_to'), thresholdUnits: z.number().positive(), covers: CoversSchema, ...subsidyBase }),
  /** The first N units of every bill are free (credited at the slab rates they fall into). */
  z.strictObject({ rule: z.literal('free_units'), units: z.number().positive(), ...subsidyBase }),
  /**
   * Household entitlement = min(capUnits, baseline x multiplier). Within entitlement the
   * covered lines are free. Above it: 'excess_only' bills units beyond the entitlement,
   * 'full_bill' removes the subsidy. Above fullBillAboveUnits the subsidy always lapses.
   */
  z.strictObject({
    rule: z.literal('entitlement'),
    capUnits: z.number().positive(),
    baselineMultiplier: z.number().positive(),
    excessBilling: z.enum(['excess_only', 'full_bill']),
    fullBillAboveUnits: z.number().positive().optional(),
    covers: CoversSchema,
    ...subsidyBase,
  }),
  /** percent off the covered lines when aboveUnits < units <= upToUnits, optionally capped. */
  z.strictObject({
    rule: z.literal('percent_band'),
    aboveUnits: z.number().min(0),
    upToUnits: z.number().positive(),
    percent: z.number().positive().max(100),
    capAmount: z.number().positive().optional(),
    covers: CoversSchema,
    ...subsidyBase,
  }),
  /**
   * The government pays the gap between the regulator's tariff and a lower schedule the
   * consumer actually pays (Tamil Nadu). Credit = energy at tariff - energy at these schedules.
   */
  z.strictObject({
    rule: z.literal('payable_schedule'),
    schedules: z.array(EnergyScheduleSchema).min(1),
    ...subsidyBase,
  }),
]);

/* ------------------------------------------------------------ rooftop solar */

export const SolarRegimeSchema = z.strictObject({
  id: slug,
  /**
   * net_metering: imports and exports are netted in kWh; surplus is banked.
   * net_billing: imports billed at retail tariff, exports credited in INR at exportRate.
   * gross_metering: all generation sold at exportRate, all consumption billed at retail.
   */
  type: z.enum(['net_metering', 'net_billing', 'gross_metering']),
  label: z.string().min(3),
  /** The regime the simulator uses unless the caller picks another. */
  default: z.boolean(),
  minKw: z.number().min(0).optional(),
  maxKw: z.number().positive().optional(),
  exportRate: z.strictObject({
    /** INR/kWh paid for surplus/exported energy; null when not published. */
    value: z.number().min(0).nullable(),
    basis: z.string().min(2),
    variable: z.boolean(),
    /**
     * Lower rates for systems that took the central capital subsidy (e.g. KERC 2026:
     * Rs 1.96 up to 2 kW, 2.14 up to 3 kW, 2.58 above). The band containing the whole
     * system size applies.
     */
    withCentralSubsidy: z
      .array(z.strictObject({ upToKw: z.number().positive().nullable(), value: z.number().min(0) }))
      .min(1)
      .optional(),
  }),
  settlement: z.strictObject({
    /** When the kWh bank is settled. */
    period: z.enum(['billing_cycle', 'financial_year', 'custom_annual']),
    /** For custom_annual: the month (1-12) whose bill closes the settlement year. */
    yearEndMonth: z.number().int().min(1).max(12).optional(),
    surplus: z.enum(['paid_at_export_rate', 'lapses']),
    /** Share of the banked balance deducted each month it is carried (Kerala 2025: 2). */
    bankingChargePercentPerMonth: z.number().min(0).max(100).optional(),
  }),
  note: z.string().optional(),
  ...cited,
});

export const StateSolarSubsidySchema = z.strictObject({
  description: z.string().min(3),
  /** Per-kW tiers, applied cumulatively like PM Surya Ghar CFA. */
  tiers: z.array(z.strictObject({ upToKw: z.number().positive().nullable(), perKw: z.number().min(0) })).min(1),
  capInr: z.number().positive().optional(),
  /** Systems larger than this get no state subsidy at all (e.g. Gujarat 2026: 2.18 kW). */
  maxKw: z.number().positive().optional(),
  ...cited,
});

export const RooftopSolarSchema = z.strictObject({
  regimes: z.array(SolarRegimeSchema).min(1),
  capacityLimit: z.strictObject({
    maxKw: z.number().positive().optional(),
    maxPercentOfSanctionedLoad: z.number().positive().optional(),
    note: z.string().min(3),
  }),
  stateSubsidy: StateSolarSubsidySchema.optional(),
  fees: z.string().optional(),
  notes: z.array(z.string()).optional(),
  ...cited,
});

/* ----------------------------------------------------- consumer protection */

export const ConsumerProtectionItemSchema = z.strictObject({
  topic: z.enum(['meter_testing', 'check_meter', 'prepaid_reconnection', 'grievance', 'billing_dispute', 'smart_meter']),
  summary: z.string().min(10),
  feeInr: z.number().min(0).optional(),
  ...cited,
});

/* ----------------------------------------------------------------- category */

export const CategorySchema = z.strictObject({
  id: slug,
  code: z.string().min(1),
  name: z.string().min(3),
  description: z.string().min(3),
  billingCycle: z.enum(['monthly', 'bimonthly']),
  energy: EnergyChargeSchema,
  fixed: FixedChargeSchema,
  charges: z.array(AdditionalChargeSchema),
  tod: TodSchema.optional(),
  subsidies: z.array(SubsidySchema),
});

/* --------------------------------------------------------------------- book */

export const UtilitySchema = z.strictObject({
  id: slug,
  name: z.string().min(3),
  shortName: z.string().min(2),
  servedArea: z.string().min(3),
  website: httpUrl.optional(),
  /** Default solar resource location for this utility's simulations. */
  solarResource: slug,
});

const CORE_LINES = new Set(['energy', 'fixed', 'tod']);

export const TariffBookSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    bookId: slug,
    title: z.string().min(5),
    state: z.string().min(3),
    stateCode: z.string().regex(/^[A-Z]{2}$/),
    regulator: z.strictObject({ name: z.string().min(3), short: z.string().min(2), url: httpUrl }),
    utilities: z.array(UtilitySchema).min(1),
    financialYear: financialYearSchema,
    effectiveFrom: isoDate,
    effectiveTo: isoDate.optional(),
    /** complete: every bill-relevant field verified. partial: some fields unverified or missing. */
    status: z.enum(['complete', 'partial', 'draft']),
    /** When this regulator usually issues its next order (default April). Drives the tariff-season check. */
    revision: z.strictObject({ month: z.number().int().min(1).max(12), note: z.string().min(3) }).optional(),
    order: z.strictObject({ title: z.string().min(5), ...cited }),
    categories: z.array(CategorySchema).min(1),
    rooftopSolar: RooftopSolarSchema,
    consumerProtection: z.array(ConsumerProtectionItemSchema).optional(),
    sources: z.record(slug, SourceSchema),
    gaps: z.array(z.string()),
    changelog: z.array(z.strictObject({ date: isoDate, summary: z.string().min(3) })).min(1),
  })
  .superRefine((book, ctx) => checkBookIntegrity(book, ctx));

type BookShape = z.input<typeof TariffBookSchema>;

function collectCitations(value: unknown, path: string, out: { ref: string; path: string }[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCitations(item, `${path}[${index}]`, out));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'cite' && Array.isArray(child)) {
      for (const citation of child) {
        if (citation && typeof citation === 'object' && 'ref' in citation) {
          out.push({ ref: String((citation as { ref: unknown }).ref), path });
        }
      }
    } else if (key !== 'sources') {
      collectCitations(child, path ? `${path}.${key}` : key, out);
    }
  }
}

function checkBookIntegrity(book: BookShape, ctx: z.RefinementCtx): void {
  const issue = (message: string): void => ctx.addIssue({ code: 'custom', message });

  const citations: { ref: string; path: string }[] = [];
  collectCitations(book, '', citations);
  for (const { ref, path } of citations) {
    if (!(ref in book.sources)) issue(`citation "${ref}" at ${path} is not in sources`);
  }

  const utilityIds = new Set(book.utilities.map((u) => u.id));
  if (utilityIds.size !== book.utilities.length) issue('utility ids must be unique');

  const start = Number(book.financialYear.slice(0, 4));
  const fyStart = `${start}-04-01`;
  const fyEnd = `${start + 1}-03-31`;
  if (book.effectiveFrom < `${start - 1}-04-01` || book.effectiveFrom > fyEnd) {
    issue(`effectiveFrom ${book.effectiveFrom} is far outside FY ${book.financialYear} (${fyStart}..${fyEnd})`);
  }
  if (book.effectiveTo && book.effectiveTo < book.effectiveFrom) issue('effectiveTo is before effectiveFrom');

  const categoryIds = new Set<string>();
  for (const category of book.categories) {
    if (categoryIds.has(category.id)) issue(`duplicate category id ${category.id}`);
    categoryIds.add(category.id);

    const lastSchedule = category.energy.schedules.at(-1);
    if (lastSchedule?.when?.upToUnits !== undefined) {
      issue(`category ${category.id}: the last energy schedule must not have an upToUnits limit (catch-all)`);
    }

    const seen = new Set<string>(CORE_LINES);
    for (const charge of category.charges) {
      if (seen.has(charge.id)) issue(`category ${category.id}: duplicate charge id ${charge.id}`);
      if (charge.kind === 'percent') {
        for (const target of charge.of) {
          if (!seen.has(target)) {
            issue(`category ${category.id}: charge ${charge.id} refers to "${target}" which is not energy/fixed/tod or an earlier charge`);
          }
        }
      }
      for (const utility of charge.utilities ?? []) {
        if (!utilityIds.has(utility)) issue(`charge ${charge.id} refers to unknown utility ${utility}`);
      }
      seen.add(charge.id);
    }
    for (const subsidy of category.subsidies) {
      for (const utility of subsidy.utilities ?? []) {
        if (!utilityIds.has(utility)) issue(`subsidy ${subsidy.id} refers to unknown utility ${utility}`);
      }
    }
  }

  const defaults = book.rooftopSolar.regimes.filter((r) => r.default);
  if (defaults.length !== 1) issue('rooftopSolar must have exactly one default regime');
  for (const regime of book.rooftopSolar.regimes) {
    if (regime.settlement.period === 'custom_annual' && regime.settlement.yearEndMonth === undefined) {
      issue(`regime ${regime.id}: custom_annual settlement needs yearEndMonth`);
    }
  }
}

/* ----------------------------------------------------------- solar resource */

export const SolarResourceSchema = z.strictObject({
  id: slug,
  name: z.string().min(2),
  stateCode: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(5).max(38),
  lon: z.number().min(67).max(98),
  /** Monthly mean daily irradiance on a fixed, equator-facing, latitude-tilt plane (kWh/m2/day), Jan..Dec. */
  poaKwhPerM2Day: z.array(z.number().positive()).length(12),
  /** Monthly mean daily global horizontal irradiance (kWh/m2/day), Jan..Dec. */
  ghiKwhPerM2Day: z.array(z.number().positive()).length(12),
});

export const SolarResourceFileSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: SourceSchema,
  method: z.string().min(10),
  locations: z.array(SolarResourceSchema).min(1),
});

/* ----------------------------------------------------- national parameters */

export const CentralSubsidySchema = z.strictObject({
  id: slug,
  name: z.string().min(3),
  description: z.string().min(3),
  tiers: z.array(z.strictObject({ upToKw: z.number().positive().nullable(), perKw: z.number().min(0) })).min(1),
  /** Higher tiers for special category states/UTs, if different. */
  specialCategoryTiers: z.array(z.strictObject({ upToKw: z.number().positive().nullable(), perKw: z.number().min(0) })).optional(),
  specialCategoryStates: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  capInr: z.number().positive().optional(),
  specialCategoryCapInr: z.number().positive().optional(),
  ...cited,
});

export const AssumptionSchema = z.strictObject({
  id: slug,
  label: z.string().min(3),
  value: z.number(),
  unit: z.string().min(1),
  note: z.string().optional(),
  ...cited,
});

export const NationalFileSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    asOf: isoDate,
    centralSubsidies: z.array(CentralSubsidySchema).min(1),
    /** Installed cost tiers for residential rooftop systems, INR per kW before subsidy, applied cumulatively. */
    installedCost: z.strictObject({
      tiers: z.array(z.strictObject({ upToKw: z.number().positive().nullable(), inrPerKw: z.number().positive() })).min(1),
      note: z.string().min(3),
      ...cited,
    }),
    assumptions: z.array(AssumptionSchema),
    consumerRights: z.array(ConsumerProtectionItemSchema),
    sources: z.record(slug, SourceSchema),
  })
  .superRefine((file, ctx) => {
    const citations: { ref: string; path: string }[] = [];
    collectCitations(file, '', citations);
    for (const { ref, path } of citations) {
      if (!(ref in file.sources)) ctx.addIssue({ code: 'custom', message: `citation "${ref}" at ${path} is not in sources` });
    }
  });
