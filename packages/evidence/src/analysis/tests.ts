import { toEpochMinute, type TestWindow } from '../case.js';
import { formatIst, hasFlag, pulsesToWatts } from '../log/format.js';
import { pct, type Finding } from './findings.js';
import type { LogIndex } from './series.js';

/** A test window needs this share of its minutes logged, with supply present, to be judged. */
export const MIN_TEST_COVERAGE = 0.9;
const MIN_REFERENCE_PULSES = 50;

export interface CreepResult {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly minutes: number;
  /** Minutes logged with household supply present (the only minutes a test can use). */
  readonly usableMinutes: number;
  readonly pulses: number;
  readonly watts: number;
  readonly source: 'device' | 'case';
}

export interface ReferenceResult {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly minutes: number;
  readonly usableMinutes: number;
  readonly pulses: number;
  readonly measuredWatts: number;
  readonly referenceWatts: number;
  readonly error: number;
  readonly tolerance: number;
}

/** Contiguous runs of minutes carrying a flag. */
function flaggedRuns(index: LogIndex, flag: 'CREEP_TEST' | 'REFERENCE_TEST'): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  for (const record of index.records) {
    if (!hasFlag(record.flags, flag)) continue;
    const last = runs.at(-1);
    if (last && last.end === record.epochMinute) runs[runs.length - 1] = { start: last.start, end: record.epochMinute + 1 };
    else runs.push({ start: record.epochMinute, end: record.epochMinute + 1 });
  }
  return runs;
}

/** Pulses and minutes from records that were logged with supply present and no sensor fault. */
function usable(index: LogIndex, start: number, end: number): { pulses: number; minutes: number } {
  let pulses = 0;
  let minutes = 0;
  for (const record of index.slice(start, end)) {
    if (hasFlag(record.flags, 'SUPPLY_LOST') || hasFlag(record.flags, 'SENSOR_FAULT')) continue;
    pulses += record.pulses;
    minutes += 1;
  }
  return { pulses, minutes };
}

export function creepTests(index: LogIndex, windows: readonly TestWindow[]): CreepResult[] {
  const fromCase = windows.map((w) => ({ start: toEpochMinute(w.start), end: toEpochMinute(w.end), source: 'case' as const }));
  const fromDevice = flaggedRuns(index, 'CREEP_TEST')
    .filter((run) => !fromCase.some((c) => c.start < run.end && run.start < c.end))
    .map((run) => ({ ...run, source: 'device' as const }));
  return [...fromCase, ...fromDevice].map(({ start, end, source }) => {
    const { pulses, minutes } = usable(index, start, end);
    return {
      startMinute: start,
      endMinute: end,
      minutes: end - start,
      usableMinutes: minutes,
      pulses,
      watts: pulsesToWatts(pulses, index.impPerKwh, minutes),
      source,
    };
  });
}

export function referenceTests(index: LogIndex, windows: readonly TestWindow[]): ReferenceResult[] {
  return windows.flatMap((w) => {
    if (w.referenceWatts === undefined) return [];
    const start = toEpochMinute(w.start);
    const end = toEpochMinute(w.end);
    const { pulses, minutes } = usable(index, start, end);
    const measuredWatts = pulsesToWatts(pulses, index.impPerKwh, minutes);
    const quantisation = pulses > 0 ? 1 / pulses : 1;
    const tolerance = 0.01 + (w.instrumentAccuracyPct ?? 2) / 100 + quantisation;
    return [
      {
        startMinute: start,
        endMinute: end,
        minutes: end - start,
        usableMinutes: minutes,
        pulses,
        measuredWatts,
        referenceWatts: w.referenceWatts,
        error: (measuredWatts - w.referenceWatts) / w.referenceWatts,
        tolerance,
      },
    ];
  });
}

function insufficient(id: string, kind: string, when: string, usableMinutes: number, minutes: number): Finding {
  return {
    id,
    severity: 'low',
    title: `${kind} cannot be judged (${when})`,
    summary: `Only ${usableMinutes} of ${minutes} minutes were logged with household supply present and a clean sensor signal; at least ${pct(MIN_TEST_COVERAGE)} is needed.`,
    details: ['Repeat the test with the device powered and the clip seated firmly.'],
  };
}

export function creepFindings(results: readonly CreepResult[]): Finding[] {
  return results.map((r, i) => {
    const when = `${formatIst(r.startMinute)}, ${r.minutes} min`;
    if (r.minutes < 10) {
      return { id: `creep-${i}`, severity: 'low', title: `No-load test too short (${when})`, summary: 'Run it for at least 15 minutes with the main switch off.', details: [] };
    }
    if (r.usableMinutes < r.minutes * MIN_TEST_COVERAGE) return insufficient(`creep-${i}`, 'No-load test', when, r.usableMinutes, r.minutes);
    if (r.pulses >= 2) {
      return {
        id: `creep-${i}`,
        severity: 'high',
        title: `Meter advanced with your main switch off: ${r.pulses} pulses (${when})`,
        summary: `Equivalent to about ${r.watts.toFixed(0)} W while nothing in the house should have drawn power.`,
        details: [
          'A healthy static meter shows at most one test-LED pulse with no load (the no-load or "creep" condition in IS 13779).',
          'Possible causes: meter creep, leakage in wiring between the meter and your main switch, or a load connected before your main switch. Ask for a meter test and a wiring inspection.',
          'This home test is indicative: the standard test is done at 115% of rated voltage in a lab.',
        ],
      };
    }
    return {
      id: `creep-${i}`,
      severity: 'ok',
      title: `No-load test passed (${when})`,
      summary: `${r.pulses} pulse(s) in ${r.usableMinutes} logged minutes with the main switch off.`,
      details: [],
    };
  });
}

export function referenceFindings(results: readonly ReferenceResult[]): Finding[] {
  return results.map((r, i) => {
    const when = `${formatIst(r.startMinute)}, ${r.minutes} min`;
    if (r.usableMinutes < r.minutes * MIN_TEST_COVERAGE) return insufficient(`reference-${i}`, 'Reference-load test', when, r.usableMinutes, r.minutes);
    if (r.pulses < MIN_REFERENCE_PULSES) {
      return {
        id: `reference-${i}`,
        severity: 'low',
        title: `Reference-load test too short to judge (${r.pulses} pulses, ${when})`,
        summary: `Run a known load (e.g. a 1-2 kW heater) long enough for at least ${MIN_REFERENCE_PULSES} pulses; 200 or more gives a tighter result.`,
        details: [],
      };
    }
    const off = Math.abs(r.error) > r.tolerance;
    return {
      id: `reference-${i}`,
      severity: off ? 'medium' : 'ok',
      title: off
        ? `Meter registered ${pct(r.error)} ${r.error > 0 ? 'more' : 'less'} than a ${r.referenceWatts} W reference load (${when})`
        : `Meter agrees with a ${r.referenceWatts} W reference load within ${pct(r.tolerance)} (${when})`,
      summary: `Measured ${r.measuredWatts.toFixed(0)} W from ${r.pulses} pulses vs ${r.referenceWatts} W on the reference instrument; allowed band ±${pct(r.tolerance)} (meter class 1 + instrument accuracy + pulse counting).`,
      details: off
        ? [
            'Indicative only: everything else in the house must have been off, and plug-in meters have their own error. A deviation this large justifies requesting a formal meter test.',
          ]
        : [],
    };
  });
}
