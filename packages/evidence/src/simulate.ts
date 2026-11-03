/**
 * Synthetic Meter Sakshi logs for demos, tests and firmware cross-checks. Pulses are
 * generated the way a meter makes them: energy accumulates continuously and a pulse is
 * emitted each time another 1/imp_per_kWh kWh has been registered.
 */
import { CSV_HEADER, FLAGS, LOG_MAGIC, LOG_VERSION, epochToMinute, istHour, type LogRecord, type ParsedLog } from './log/format.js';
import { genesisHash, recordInput, sha256Hex } from './log/hash.js';

export interface SimWindow {
  readonly startIso: string;
  readonly minutes: number;
}

export interface SimulateOptions {
  readonly deviceId?: string;
  readonly impPerKwh?: number;
  readonly firmware?: string;
  /** First minute (any ISO timestamp; floored to the minute). */
  readonly startIso: string;
  readonly days: number;
  /** Average household consumption per day. */
  readonly dailyKwh: number;
  /** 24 weights by IST hour. Default: evening-peak household. */
  readonly profile?: readonly number[];
  readonly seed?: number;
  /** Supply off (device on battery): no consumption, SUPPLY_LOST flag. */
  readonly outages?: readonly SimWindow[];
  /** Device offline: the meter keeps running but nothing is recorded. */
  readonly missing?: readonly SimWindow[];
  /** Main switch off for a no-load test; leakWatts simulates a creeping meter or leakage. */
  readonly creepTest?: SimWindow & { readonly leakWatts?: number };
  /** Only a reference load running; meterErrorPct simulates a fast (+) or slow (-) meter. */
  readonly referenceTest?: SimWindow & { readonly watts: number; readonly meterErrorPct?: number };
  /** Append "# digest" lines at each UTC day end. */
  readonly digests?: boolean;
}

const DEFAULT_PROFILE = [2.5, 2.2, 2, 2, 2, 2.4, 3.6, 4.6, 4.6, 3.8, 3.2, 3, 3.2, 3.2, 3, 3, 3.2, 4, 5.6, 6.6, 7, 6.6, 5.2, 3.6];

/** Small deterministic PRNG (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inWindows(minute: number, windows: readonly SimWindow[] | undefined): boolean {
  return (windows ?? []).some((w) => {
    const start = Math.floor(Date.parse(w.startIso) / 60_000);
    return minute >= start && minute < start + w.minutes;
  });
}

function wattsAt(minute: number, opts: SimulateOptions, shape: readonly number[], random: () => number): { watts: number; flags: number } {
  if (inWindows(minute, opts.outages)) return { watts: 0, flags: FLAGS.SUPPLY_LOST };
  if (opts.creepTest && inWindows(minute, [opts.creepTest])) return { watts: opts.creepTest.leakWatts ?? 0, flags: FLAGS.CREEP_TEST };
  if (opts.referenceTest && inWindows(minute, [opts.referenceTest])) {
    return { watts: opts.referenceTest.watts * (1 + (opts.referenceTest.meterErrorPct ?? 0) / 100), flags: FLAGS.REFERENCE_TEST };
  }
  const hourKwh = opts.dailyKwh * (shape[istHour(minute)] ?? 0);
  return { watts: hourKwh * 1000 * (0.4 + 1.2 * random()), flags: 0 };
}

export async function simulateLog(opts: SimulateOptions): Promise<{ text: string; log: ParsedLog }> {
  if (!Number.isFinite(opts.days) || opts.days <= 0 || opts.days > 400) throw new RangeError('days must be 1-400');
  if (!Number.isFinite(opts.dailyKwh) || opts.dailyKwh < 0) throw new RangeError('dailyKwh must be ≥ 0');
  if (opts.impPerKwh !== undefined && (!Number.isInteger(opts.impPerKwh) || opts.impPerKwh <= 0)) throw new RangeError('impPerKwh must be a positive integer');
  const deviceId = opts.deviceId ?? 'MS-DEMO01';
  const impPerKwh = opts.impPerKwh ?? 3200;
  const weights = opts.profile ?? DEFAULT_PROFILE;
  const total = weights.reduce((a, b) => a + b, 0);
  const shape = weights.map((w) => w / total);
  const random = prng(opts.seed ?? 42);
  const start = Math.floor(Date.parse(opts.startIso) / 60_000);
  if (!Number.isFinite(start)) throw new RangeError(`invalid startIso ${opts.startIso}`);

  let previous = await genesisHash(deviceId, impPerKwh);
  let accumulator = 0;
  let booted = false;
  const records: LogRecord[] = [];
  const lines = [`# ${LOG_MAGIC} v${LOG_VERSION}`, `# device_id=${deviceId}`, `# imp_per_kwh=${impPerKwh}`, `# firmware=${opts.firmware ?? 'sim-0.1.0'}`, CSV_HEADER];

  for (let minute = start; minute < start + opts.days * 1440; minute += 1) {
    const { watts, flags: baseFlags } = wattsAt(minute, opts, shape, random);
    accumulator += (watts * impPerKwh) / 60_000;
    const pulses = Math.floor(accumulator);
    accumulator -= pulses;
    if (inWindows(minute, opts.missing)) {
      booted = false;
      continue;
    }
    const flags = baseFlags | (booted ? 0 : FLAGS.BOOT);
    booted = true;
    const stamp = epochToMinute(minute);
    const hash = await sha256Hex(recordInput(previous, stamp, pulses, flags));
    records.push({ index: records.length, minute: stamp, epochMinute: minute, pulses, flags, hash });
    lines.push(`${stamp},${pulses},${flags},${hash}`);
    previous = hash;
    if (opts.digests && (minute + 1) % 1440 === 0) lines.push(`# digest ${stamp.slice(0, 10)} ${hash}`);
  }

  const header = { version: LOG_VERSION, deviceId, impPerKwh, firmware: opts.firmware ?? 'sim-0.1.0' };
  return { text: `${lines.join('\n')}\n`, log: { header, records, digests: [] } };
}
