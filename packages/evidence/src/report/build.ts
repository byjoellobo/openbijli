import { parseCaseFile, type CaseFile } from '../case.js';
import { auditPrepaid, type PrepaidAudit } from '../analysis/prepaid.js';
import { reconcileBill, type BillReconciliation, type TariffComputer } from '../analysis/reconcile.js';
import { LogIndex, type DailyPoint } from '../analysis/series.js';
import { deviceOfflineGaps, findOutages, matchRecharges, supplyFindings, type Outage, type RechargeRestoration } from '../analysis/supply.js';
import { creepFindings, creepTests, referenceFindings, referenceTests, type CreepResult, type ReferenceResult } from '../analysis/tests.js';
import { sortFindings, type Finding, type Severity } from '../analysis/findings.js';
import { hasFlag, type LogHeader, type ParsedLog } from '../log/format.js';
import { verifyChain, type ChainVerification } from '../log/verify.js';

export interface RightsItem {
  readonly topic: string;
  readonly summary: string;
  readonly sourceTitle?: string;
  readonly sourceUrl?: string;
}

export interface ReportInput {
  readonly log: ParsedLog;
  /** Raw (unvalidated) or parsed case file. */
  readonly caseFile: unknown;
  readonly billFor?: TariffComputer;
  readonly rights?: readonly RightsItem[];
  readonly generatedAt?: Date;
}

export interface Report {
  readonly generatedAt: string;
  readonly caseFile: CaseFile;
  readonly device: LogHeader & { readonly impPerKwhUsed: number };
  readonly log: {
    readonly firstMinute: number;
    readonly lastMinute: number;
    readonly records: number;
    readonly coverage: number;
    readonly boots: number;
    readonly unsyncedMinutes: number;
    readonly sensorFaultMinutes: number;
    readonly digests: number;
    readonly lastHash: string;
    readonly chain: ChainVerification;
  };
  readonly bills: readonly BillReconciliation[];
  readonly prepaid?: PrepaidAudit;
  readonly outages: readonly Outage[];
  readonly restorations: readonly RechargeRestoration[];
  readonly creep: readonly CreepResult[];
  readonly reference: readonly ReferenceResult[];
  readonly daily: readonly DailyPoint[];
  readonly hourlyProfile: readonly number[];
  readonly findings: readonly Finding[];
  readonly overall: Severity;
  readonly method: readonly string[];
  readonly limitations: readonly string[];
  readonly nextSteps: readonly RightsItem[];
}

export const METHOD: readonly string[] = [
  "Meter Sakshi counts the flashes of the electricity meter's own test LED (marked imp/kWh or pulses/kWh on the meter). Each flash is a fixed amount of energy registered by the meter, so the count is the meter's own measurement, read without opening, wiring into or touching the meter.",
  'The device writes one record per minute: UTC time, pulse count and status flags. Each record includes a SHA-256 hash of the previous record, so editing, removing or reordering a record inside the export breaks the chain at that point.',
  'Bills are compared with the pulses logged between the billing period dates. Amounts are recomputed from the published tariff order in the Open Tariff India dataset, with every rate linked to its source.',
];

export const LIMITATIONS: readonly string[] = [
  'The LED shows what the meter registered. It cannot show that the meter itself measures correctly; only the no-load and reference-load tests below give an indication of that, and a laboratory test is the formal route.',
  'Billing-period boundaries are taken from the bill. Meter readings are rarely taken exactly at midnight, so a tolerance of 2% + 1 kWh is allowed before a difference is reported.',
  'Minutes with no record (device unplugged or rebooting) are filled at the period mean when estimating consumption and reported separately.',
  'The hash chain detects edits inside an export, but the hashing method is public, so it cannot by itself prove that a device produced the log, that records were not dropped from the end, or that the clock was right (unsynchronised minutes are flagged). Daily digests shared with a third party as each day closes (e-mail or WhatsApp to a consumer group) are what make the log hard to fabricate after the fact.',
  'Variable components (monthly fuel/power-purchase adjustments) use the latest value in the dataset and may differ from the month billed.',
];

const DEFAULT_STEPS: readonly RightsItem[] = [
  {
    topic: 'complaint',
    summary: "Write to your utility's customer care or section office, attach this report and the CSV log, and ask for (1) the meter reading history for the period, (2) an itemised bill, and (3) a check meter or a meter test if the findings point at the meter.",
  },
  {
    topic: 'grievance',
    summary: 'If the utility does not resolve it, complain to the Consumer Grievance Redressal Forum (CGRF) of your utility, set up under Section 42(5) of the Electricity Act, 2003. You can appeal a CGRF decision to the State Electricity Ombudsman under Section 42(6).',
    sourceTitle: 'The Electricity Act, 2003 (Section 42)',
    sourceUrl: 'https://cercind.gov.in/Act-with-amendment.pdf',
  },
];

function overallSeverity(findings: readonly Finding[]): Severity {
  return findings[0]?.severity ?? 'ok';
}

function safeComputer(billFor: TariffComputer | undefined, errors: string[]): TariffComputer | undefined {
  if (!billFor) return undefined;
  return (units, onDateIso, periodDays) => {
    try {
      return billFor(units, onDateIso, periodDays);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
}

function integrityFindings(chain: ChainVerification, header: LogHeader, caseFile: CaseFile, unsynced: number): Finding[] {
  const findings: Finding[] = [];
  findings.push(
    chain.ok
      ? {
          id: 'chain',
          severity: 'ok',
          title: 'Log is internally consistent',
          summary: `${chain.message} No record in this export was edited, removed from the middle or reordered after its hash was computed.`,
          details: [`Anchor: ${chain.anchor} ${chain.anchorHash.slice(0, 16)}...`, 'Compare the daily digests with any you shared earlier to show the log existed in this form on those days.'],
        }
      : {
          id: 'chain',
          severity: 'high',
          title: 'Log FAILS its integrity check',
          summary: `${chain.message} Do not rely on the findings below until a clean export is produced from the device.`,
          details: [],
        },
  );
  if (chain.ok && !chain.headerBound) {
    findings.push({
      id: 'chain-partial',
      severity: 'medium',
      title: 'This export starts part-way through the device log',
      summary: 'Its header (device id and meter constant) is not covered by the hash chain. Check that its chain_prev hash matches a daily digest you recorded earlier, or export from the first day.',
      details: [],
    });
  }
  if (caseFile.meter.impPerKwh !== undefined && caseFile.meter.impPerKwh !== header.impPerKwh) {
    findings.push({
      id: 'constant',
      severity: 'info',
      title: `Meter constant overridden: ${caseFile.meter.impPerKwh} imp/kWh (device header says ${header.impPerKwh})`,
      summary: 'All kWh figures use the value from the case file. Check it against the label printed on the meter.',
      details: [],
    });
  }
  if (unsynced > 0) {
    findings.push({ id: 'clock', severity: 'low', title: `Clock unsynchronised for ${unsynced} minute(s)`, summary: 'Timestamps in those minutes may be off.', details: [] });
  }
  return findings;
}

/** Run every analysis and assemble a report. Pure apart from hashing. */
export async function buildReport(input: ReportInput): Promise<Report> {
  const caseFile = parseCaseFile(input.caseFile);
  const { log } = input;
  const impPerKwhUsed = caseFile.meter.impPerKwh ?? log.header.impPerKwh;
  const index = new LogIndex(log, impPerKwhUsed);
  const chain = await verifyChain(log);
  const tariffErrors: string[] = [];
  const billFor = safeComputer(input.billFor, tariffErrors);

  const whole = index.window(index.firstMinute, index.lastMinute + 1);
  const bills = caseFile.bills.map((bill) => reconcileBill(index, bill, billFor));
  const ledger = caseFile.prepaidLedger ?? [];
  const prepaid = billFor && ledger.some((e) => e.type === 'deduction') ? auditPrepaid(index, ledger, billFor) : undefined;
  const outages = findOutages(index);
  const restorations = matchRecharges(outages, ledger);
  const creep = creepTests(index, caseFile.creepTests ?? []);
  const reference = referenceTests(index, caseFile.referenceTests ?? []);
  const boots = log.records.filter((r) => hasFlag(r.flags, 'BOOT')).length;

  const findings = sortFindings([
    ...integrityFindings(chain, log.header, caseFile, whole.unsyncedMinutes),
    ...bills.flatMap((b) => b.findings),
    ...(prepaid?.findings ?? []),
    ...supplyFindings(outages, restorations, deviceOfflineGaps(index), caseFile.reconnectionStandardHours),
    ...creepFindings(creep),
    ...referenceFindings(reference),
    ...(tariffErrors.length > 0
      ? [{ id: 'tariff', severity: 'low' as const, title: 'Tariff comparison unavailable for some periods', summary: [...new Set(tariffErrors)].join(' '), details: [] }]
      : []),
  ]);

  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    caseFile,
    device: { ...log.header, impPerKwhUsed },
    log: {
      firstMinute: index.firstMinute,
      lastMinute: index.lastMinute,
      records: log.records.length,
      coverage: whole.coverage,
      boots,
      unsyncedMinutes: whole.unsyncedMinutes,
      sensorFaultMinutes: whole.sensorFaultMinutes,
      digests: log.digests.length,
      lastHash: log.records.at(-1)?.hash ?? '',
      chain,
    },
    bills,
    ...(prepaid ? { prepaid } : {}),
    outages,
    restorations,
    creep,
    reference,
    daily: index.daily(),
    hourlyProfile: index.hourlyProfile(),
    findings,
    overall: overallSeverity(findings),
    method: METHOD,
    limitations: LIMITATIONS,
    nextSteps: [...DEFAULT_STEPS, ...(input.rights ?? [])],
  };
}
