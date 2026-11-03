import type { BillClaim } from '../case.js';
import { toEpochMinute } from '../case.js';
import { formatIst } from '../log/format.js';
import { kwh, pct, rupees, type Finding, type Severity } from './findings.js';
import type { LogIndex, WindowStats } from './series.js';

/**
 * Bill total and its fixed part for units consumed in a period starting on a date.
 * periodDays lets the computer pro-rate when a bill covers more or fewer days than a cycle.
 */
export type TariffComputer = (
  units: number,
  onDateIso: string,
  periodDays?: number,
) => { total: number; fixed: number; label: string } | null;

export type BillVerdict = 'consistent' | 'overbilled_units' | 'possible_overbilling' | 'underbilled' | 'insufficient_data';

export interface BillReconciliation {
  readonly bill: BillClaim;
  readonly window: WindowStats;
  readonly observedKwh: number;
  /** Observed kWh with missing minutes filled at the period's mean rate. */
  readonly estimatedKwh: number;
  readonly discrepancyKwh: number;
  readonly discrepancyPct: number | null;
  readonly verdict: BillVerdict;
  readonly expectedAmountForBilled?: number;
  readonly expectedAmountForLogged?: number;
  readonly tariffLabel?: string;
  readonly findings: readonly Finding[];
}

/** Reading-time misalignment and LED counting allowance. */
export const RELATIVE_TOLERANCE = 0.02;
export const ABSOLUTE_TOLERANCE_KWH = 1;
export const HIGH_CONFIDENCE_COVERAGE = 0.98;
export const MINIMUM_COVERAGE = 0.5;

function classify(billed: number, w: WindowStats, estimated: number): { verdict: BillVerdict; severity: Severity } {
  if (w.coverage < MINIMUM_COVERAGE) return { verdict: 'insufficient_data', severity: 'low' };
  const tolerance = RELATIVE_TOLERANCE * estimated + ABSOLUTE_TOLERANCE_KWH;
  const gapShare = 1 - w.coverage;
  const faulty = w.sensorFaultMinutes > 0.01 * w.expectedMinutes;
  if (w.coverage >= HIGH_CONFIDENCE_COVERAGE) {
    if (billed > estimated + tolerance) return { verdict: 'overbilled_units', severity: faulty ? 'medium' : 'high' };
    if (billed < estimated - tolerance) return { verdict: 'underbilled', severity: 'info' };
    return { verdict: 'consistent', severity: 'ok' };
  }
  if (billed > estimated * (1 + gapShare) + tolerance) return { verdict: 'possible_overbilling', severity: 'medium' };
  return { verdict: 'consistent', severity: 'ok' };
}

function unitsFinding(bill: BillClaim, w: WindowStats, estimated: number, verdict: BillVerdict, severity: Severity): Finding {
  const period = `${formatIst(w.startMinute)} to ${formatIst(w.endMinute)}`;
  const coverage = `Device logged ${pct(w.coverage)} of the period (${w.gaps.length} gap(s)).`;
  const diff = bill.billedUnits - estimated;
  const titles: Record<BillVerdict, string> = {
    overbilled_units: `Bill ${bill.id}: billed ${kwh(bill.billedUnits)}, meter registered ${kwh(estimated)}`,
    possible_overbilling: `Bill ${bill.id}: billed units look high for what the meter registered`,
    underbilled: `Bill ${bill.id}: billed fewer units than the meter registered`,
    consistent: `Bill ${bill.id}: billed units match the meter`,
    insufficient_data: `Bill ${bill.id}: not enough logged data to judge`,
  };
  const summaries: Record<BillVerdict, string> = {
    overbilled_units: `The bill charges ${kwh(diff)} (${pct(diff / Math.max(estimated, 1e-9))}) more than the meter's own pulse LED registered over the same period. Since the LED is driven by the meter itself, this points to a reading, data-entry or billing-system error rather than a meter fault.`,
    possible_overbilling: `Billed units exceed the logged consumption by more than the logging gaps can explain. Close the gaps (keep the device powered) for a firm conclusion.`,
    underbilled: `The bill shows ${kwh(-diff)} less than registered. This often means a provisional or average bill; expect a catch-up charge later.`,
    consistent: `Billed units are within ${pct(RELATIVE_TOLERANCE)} + ${ABSOLUTE_TOLERANCE_KWH} kWh of the logged consumption.`,
    insufficient_data: `Only ${pct(w.coverage)} of the period was logged; at least ${pct(MINIMUM_COVERAGE)} is needed.`,
  };
  return {
    id: `bill-${bill.id}-units`,
    severity,
    title: titles[verdict],
    summary: summaries[verdict],
    details: [
      `Period: ${period}.`,
      coverage,
      `Logged pulses: ${w.pulses} → ${kwh(w.kwh)} observed; ${kwh(estimated)} with gaps filled at the period's mean rate.`,
      ...(w.sensorFaultMinutes > 0 ? [`Sensor reported faults for ${w.sensorFaultMinutes} minute(s); pulses may have been missed in those minutes.`] : []),
      ...(w.unsyncedMinutes > 0 ? [`Clock was unsynchronised for ${w.unsyncedMinutes} minute(s).`] : []),
    ],
  };
}

function amountFindings(bill: BillClaim, expectedForBilled: number, label: string): Finding[] {
  if (bill.billedAmount === undefined) return [];
  const diff = bill.billedAmount - expectedForBilled;
  const threshold = Math.max(10, 0.03 * expectedForBilled);
  if (Math.abs(diff) <= threshold) {
    return [
      {
        id: `bill-${bill.id}-amount`,
        severity: 'ok',
        title: `Bill ${bill.id}: amount matches the published tariff`,
        summary: `${rupees(bill.billedAmount)} charged vs ${rupees(expectedForBilled)} from ${label} for the billed units.`,
        details: [],
      },
    ];
  }
  return [
    {
      id: `bill-${bill.id}-amount`,
      severity: diff > 0 ? 'medium' : 'info',
      title: `Bill ${bill.id}: amount ${diff > 0 ? 'exceeds' : 'is below'} the published tariff by ${rupees(Math.abs(diff))}`,
      summary: `For ${kwh(bill.billedUnits)} the published tariff (${label}) gives ${rupees(expectedForBilled)}, but ${rupees(bill.billedAmount)} was charged.`,
      details: [
        'Monthly fuel/power-purchase adjustments, arrears, late fees, security-deposit interest or meter rent can explain part of a difference. Ask the utility for an itemised bill showing each component and the tariff order it applies.',
      ],
    },
  ];
}

function readingFinding(bill: BillClaim): Finding[] {
  if (bill.openingReading === undefined || bill.closingReading === undefined) return [];
  const delta = bill.closingReading - bill.openingReading;
  if (Math.abs(delta - bill.billedUnits) <= 0.5) return [];
  return [
    {
      id: `bill-${bill.id}-readings`,
      severity: 'medium',
      title: `Bill ${bill.id}: readings do not add up`,
      summary: `Closing ${bill.closingReading} − opening ${bill.openingReading} = ${delta.toFixed(1)} kWh, but ${kwh(bill.billedUnits)} were billed.`,
      details: ['Unless a multiplying factor or meter change is shown on the bill, the billed units should equal the reading difference.'],
    },
  ];
}

export function reconcileBill(index: LogIndex, bill: BillClaim, billFor?: TariffComputer): BillReconciliation {
  const window = index.window(toEpochMinute(bill.periodStart), toEpochMinute(bill.periodEnd));
  const gapMinutes = window.expectedMinutes - window.loggedMinutes;
  const meanPerMinute = window.loggedMinutes > 0 ? window.kwh / window.loggedMinutes : 0;
  const estimatedKwh = window.kwh + gapMinutes * meanPerMinute;
  const { verdict, severity } = classify(bill.billedUnits, window, estimatedKwh);
  const findings: Finding[] = [unitsFinding(bill, window, estimatedKwh, verdict, severity), ...readingFinding(bill)];

  const periodDays = window.expectedMinutes / 1440;
  const forBilled = billFor?.(bill.billedUnits, bill.periodStart, periodDays) ?? null;
  const forLogged = billFor?.(estimatedKwh, bill.periodStart, periodDays) ?? null;
  if (forBilled) findings.push(...amountFindings(bill, forBilled.total, forBilled.label));
  if (forBilled && forLogged && verdict === 'overbilled_units') {
    findings.push({
      id: `bill-${bill.id}-excess`,
      severity: 'high',
      title: `Bill ${bill.id}: estimated excess charge ${rupees(forBilled.total - forLogged.total)}`,
      summary: `At the published tariff, the logged ${kwh(estimatedKwh)} would cost ${rupees(forLogged.total)} instead of ${rupees(forBilled.total)} for the billed units.`,
      details: [],
    });
  }

  return {
    bill,
    window,
    observedKwh: window.kwh,
    estimatedKwh,
    discrepancyKwh: bill.billedUnits - estimatedKwh,
    discrepancyPct: estimatedKwh > 0 ? (bill.billedUnits - estimatedKwh) / estimatedKwh : null,
    verdict,
    ...(forBilled ? { expectedAmountForBilled: forBilled.total, tariffLabel: forBilled.label } : {}),
    ...(forLogged ? { expectedAmountForLogged: forLogged.total } : {}),
    findings,
  };
}
