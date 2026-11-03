/**
 * The consumer's side of a dispute: which utility, the bills or prepaid ledger being
 * questioned, and any tests they ran. Validated with zod because it comes from a file
 * or a web form.
 */
import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true, local: false });
/** Free text that will be shown in reports: one line, no control characters. */
const oneLine = (max: number) => z.string().max(max).regex(/^[^\u0000-\u001f\u007f]*$/, 'must be a single line of text');

export const BillClaimSchema = z.object({
  id: oneLine(64).min(1),
  /** Billing period as printed on the bill (ISO with offset and seconds, e.g. 2026-09-01T00:00:00+05:30). */
  periodStart: timestamp,
  periodEnd: timestamp,
  billedUnits: z.number().min(0),
  billedAmount: z.number().min(0).optional(),
  openingReading: z.number().min(0).optional(),
  closingReading: z.number().min(0).optional(),
});

export const LedgerEntrySchema = z.object({
  timestamp,
  type: z.enum(['recharge', 'deduction']),
  amount: z.number().min(0),
  note: oneLine(200).optional(),
});

export const TestWindowSchema = z.object({
  start: timestamp,
  end: timestamp,
  /** Wattage of the reference load measured with a separate plug-in meter. */
  referenceWatts: z.number().positive().optional(),
  /** Accuracy of that instrument in percent (default 2). */
  instrumentAccuracyPct: z.number().positive().max(20).optional(),
  instrument: oneLine(100).optional(),
});

export const CaseFileSchema = z
  .object({
    consumer: z
      .object({
        name: oneLine(100).optional(),
        accountNumber: oneLine(40).optional(),
        address: oneLine(300).optional(),
      })
      .optional(),
    utilityId: z.string().regex(/^[a-z0-9-]+$/),
    sanctionedLoadKw: z.number().positive().max(1000),
    phase: z.enum(['single', 'three']).optional(),
    area: z.enum(['urban', 'rural']).optional(),
    meter: z.object({
      type: z.enum(['prepaid', 'postpaid']),
      serial: oneLine(40).optional(),
      make: oneLine(60).optional(),
      /** Overrides imp/kWh in the log header if the device was misconfigured. */
      impPerKwh: z.number().positive().max(100_000).optional(),
    }),
    bills: z.array(BillClaimSchema).max(36),
    prepaidLedger: z.array(LedgerEntrySchema).max(5000).optional(),
    creepTests: z.array(TestWindowSchema).max(50).optional(),
    referenceTests: z.array(TestWindowSchema).max(50).optional(),
    /** Hours within which supply should be restored after a recharge, if the consumer knows the local standard. */
    reconnectionStandardHours: z.number().positive().max(720).optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    for (const bill of value.bills) {
      if (Date.parse(bill.periodEnd) <= Date.parse(bill.periodStart)) {
        ctx.addIssue({ code: 'custom', message: `bill ${bill.id}: periodEnd must be after periodStart` });
      }
    }
    for (const test of [...(value.creepTests ?? []), ...(value.referenceTests ?? [])]) {
      if (Date.parse(test.end) <= Date.parse(test.start)) ctx.addIssue({ code: 'custom', message: `test ${test.start}: end must be after start` });
    }
  });

export type CaseFile = z.infer<typeof CaseFileSchema>;
export type BillClaim = z.infer<typeof BillClaimSchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type TestWindow = z.infer<typeof TestWindowSchema>;

export function parseCaseFile(input: unknown): CaseFile {
  const result = CaseFileSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid case file:\n  ${issues.join('\n  ')}`);
  }
  return result.data;
}

export function toEpochMinute(iso: string): number {
  return Math.floor(Date.parse(iso) / 60_000);
}
