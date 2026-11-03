import { toEpochMinute, type LedgerEntry } from '../case.js';
import { formatIst, hasFlag } from '../log/format.js';
import { type Finding } from './findings.js';
import type { Gap, LogIndex } from './series.js';

export interface Outage {
  readonly startMinute: number;
  /** Exclusive end: first minute with supply back (or the first unlogged minute when endsInGap). */
  readonly endMinute: number;
  readonly minutes: number;
  /** True when the log ends during the outage. */
  readonly ongoing: boolean;
  /** True when the device stopped logging during the outage (battery ran out), so the true end is unknown. */
  readonly endsInGap: boolean;
}

export interface RechargeRestoration {
  readonly recharge: LedgerEntry;
  readonly rechargeMinute: number;
  /** Outage in progress when the recharge was made, if any. */
  readonly outage?: Outage;
  readonly delayMinutes?: number;
}

/** Runs of consecutive minutes flagged SUPPLY_LOST. A missing minute ends a run. */
export function findOutages(index: LogIndex): Outage[] {
  const outages: Outage[] = [];
  let start: number | null = null;
  let last = 0;
  for (const record of index.records) {
    const lost = hasFlag(record.flags, 'SUPPLY_LOST');
    const contiguous = record.epochMinute === last + 1;
    if (start !== null && (!lost || !contiguous)) {
      outages.push({ startMinute: start, endMinute: last + 1, minutes: last + 1 - start, ongoing: false, endsInGap: !contiguous });
      start = null;
    }
    if (lost && start === null) start = record.epochMinute;
    last = record.epochMinute;
  }
  if (start !== null) outages.push({ startMinute: start, endMinute: last + 1, minutes: last + 1 - start, ongoing: true, endsInGap: false });
  return outages;
}

export function deviceOfflineGaps(index: LogIndex, minimumMinutes = 10): Gap[] {
  return index.window(index.firstMinute, index.lastMinute + 1).gaps.filter((g) => g.minutes >= minimumMinutes);
}

export function matchRecharges(outages: readonly Outage[], ledger: readonly LedgerEntry[]): RechargeRestoration[] {
  return ledger
    .filter((entry) => entry.type === 'recharge')
    .map((recharge) => {
      const rechargeMinute = toEpochMinute(recharge.timestamp);
      const outage = outages.find((o) => o.startMinute <= rechargeMinute && rechargeMinute < o.endMinute);
      if (!outage) return { recharge, rechargeMinute };
      const known = !outage.ongoing && !outage.endsInGap;
      return { recharge, rechargeMinute, outage, ...(known ? { delayMinutes: outage.endMinute - rechargeMinute } : {}) };
    });
}

function hours(minutes: number): string {
  return minutes < 120 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`;
}

export function supplyFindings(
  outages: readonly Outage[],
  restorations: readonly RechargeRestoration[],
  offline: readonly Gap[],
  standardHours?: number,
): Finding[] {
  const findings: Finding[] = [];
  for (const r of restorations) {
    if (!r.outage) continue;
    const when = formatIst(r.rechargeMinute);
    if (r.delayMinutes === undefined && r.outage.endsInGap) {
      findings.push({
        id: `recharge-${r.rechargeMinute}`,
        severity: 'medium',
        title: `Supply was still off when the device stopped logging, after a recharge on ${when}`,
        summary: `A recharge of ₹${r.recharge.amount} was made during an outage that began ${formatIst(r.outage.startMinute)}. The device's battery ran out at ${formatIst(r.outage.endMinute)}, so supply returned some time after that.`,
        details: ['Keep the device charged, or note the time supply returned yourself, to establish the full delay.'],
      });
      continue;
    }
    if (r.delayMinutes === undefined) {
      findings.push({
        id: `recharge-${r.rechargeMinute}`,
        severity: 'high',
        title: `Supply still off at the end of the log after a recharge on ${when}`,
        summary: `A recharge of ₹${r.recharge.amount} was made while supply was off, and supply had not returned by the last logged minute.`,
        details: [`Outage began ${formatIst(r.outage.startMinute)}.`],
      });
      continue;
    }
    const late = standardHours !== undefined && r.delayMinutes > standardHours * 60;
    findings.push({
      id: `recharge-${r.rechargeMinute}`,
      severity: late ? 'high' : 'info',
      title: `Supply returned ${hours(r.delayMinutes)} after the recharge on ${when}`,
      summary: late
        ? `This exceeds the ${standardHours} h standard you cited. Ask for compensation under your state's standards of performance.`
        : `Outage ${formatIst(r.outage.startMinute)} → ${formatIst(r.outage.endMinute)}; recharge of ₹${r.recharge.amount} made during it.`,
      details: [],
    });
  }

  const longest = outages.toSorted((a, b) => b.minutes - a.minutes).slice(0, 5);
  if (longest.length > 0) {
    const total = outages.reduce((sum, o) => sum + o.minutes, 0);
    findings.push({
      id: 'outages',
      severity: 'info',
      title: `${outages.length} supply interruption(s), ${hours(total)} in total`,
      summary: 'Recorded while the device ran on its backup battery. Longest:',
      details: longest.map(
        (o) => `${formatIst(o.startMinute)} for ${o.endsInGap ? 'at least ' : ''}${hours(o.minutes)}${o.ongoing ? ' (ongoing at end of log)' : ''}${o.endsInGap ? ' (device battery ran out)' : ''}`,
      ),
    });
  }
  if (offline.length > 0) {
    findings.push({
      id: 'device-offline',
      severity: 'low',
      title: `Device was offline ${offline.length} time(s)`,
      summary: 'No records exist for these periods, so consumption and supply status there are unknown.',
      details: offline.slice(0, 5).map((g) => `${formatIst(g.startMinute)} for ${hours(g.minutes)}`),
    });
  }
  return findings;
}
