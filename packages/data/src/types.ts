/**
 * Types inferred from the zod schemas. Importing this module never pulls zod into a
 * bundle because every import here is type-only.
 */
import type { z } from 'zod';
import type {
  AdditionalChargeSchema,
  AssumptionSchema,
  CategorySchema,
  CentralSubsidySchema,
  CitationSchema,
  ConditionSchema,
  ConsumerProtectionItemSchema,
  ContextFlagSchema,
  EnergyScheduleSchema,
  FixedChargeRuleSchema,
  NationalFileSchema,
  RooftopSolarSchema,
  SlabSchema,
  SolarRegimeSchema,
  SolarResourceFileSchema,
  SolarResourceSchema,
  SourceSchema,
  SubsidySchema,
  TariffBookSchema,
  TodPeriodSchema,
  TodSchema,
  UtilitySchema,
  VerificationSchema,
} from './schema.js';

export type Source = z.infer<typeof SourceSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type ContextFlag = z.infer<typeof ContextFlagSchema>;
export type Slab = z.infer<typeof SlabSchema>;
export type EnergySchedule = z.infer<typeof EnergyScheduleSchema>;
export type FixedChargeRule = z.infer<typeof FixedChargeRuleSchema>;
export type AdditionalCharge = z.infer<typeof AdditionalChargeSchema>;
export type TodPeriod = z.infer<typeof TodPeriodSchema>;
export type Tod = z.infer<typeof TodSchema>;
export type Subsidy = z.infer<typeof SubsidySchema>;
export type SolarRegime = z.infer<typeof SolarRegimeSchema>;
export type RooftopSolar = z.infer<typeof RooftopSolarSchema>;
export type ConsumerProtectionItem = z.infer<typeof ConsumerProtectionItemSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Utility = z.infer<typeof UtilitySchema>;
export type TariffBook = z.infer<typeof TariffBookSchema>;
export type SolarResource = z.infer<typeof SolarResourceSchema>;
export type SolarResourceFile = z.infer<typeof SolarResourceFileSchema>;
export type CentralSubsidy = z.infer<typeof CentralSubsidySchema>;
export type Assumption = z.infer<typeof AssumptionSchema>;
export type NationalFile = z.infer<typeof NationalFileSchema>;

/** Everything shipped in the data package. */
export interface Catalog {
  readonly books: readonly TariffBook[];
  readonly solar: SolarResourceFile;
  readonly national: NationalFile;
}

export interface UtilitySummary {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly state: string;
  readonly stateCode: string;
  readonly bookId: string;
  readonly regulator: string;
  readonly latestFinancialYear: string;
}
