/**
 * Meter Sakshi log format v1 (spec: hardware/meter-sakshi/docs/log-format.md).
 *
 *   # meter-sakshi-log v1
 *   # device_id=MS-1A2B3C
 *   # imp_per_kwh=3200
 *   # firmware=0.1.0
 *   # chain_prev=<64 hex>          (optional: hash before the first record of this export)
 *   minute_utc,pulses,flags,hash
 *   2026-10-01T00:00Z,3,0,9f2c...
 *   # digest 2026-10-01 <64 hex>   (optional daily anchors; hash of the day's last record)
 *
 * hash_i = SHA-256( hash_{i-1} + "|" + minute_utc + "|" + pulses + "|" + flags ), lowercase hex.
 * The chain starts at genesis = SHA-256("meter-sakshi|v1|" + device_id + "|" + imp_per_kwh).
 */

export const LOG_MAGIC = 'meter-sakshi-log';
export const LOG_VERSION = 1;
export const CSV_HEADER = 'minute_utc,pulses,flags,hash';

/** Bit flags recorded by the firmware for each minute. */
export const FLAGS = {
  /** Household supply absent; device running on its backup battery. */
  SUPPLY_LOST: 1,
  /** Clock not yet synchronised (no NTP/RTC); timestamps may be off. */
  CLOCK_UNSYNCED: 2,
  /** User started a no-load (creep) test: consumer main switch OFF. */
  CREEP_TEST: 4,
  /** User started a reference-load test. */
  REFERENCE_TEST: 8,
  /** Sensor saturated or too much ambient light; pulses may be missed. */
  SENSOR_FAULT: 16,
  /** First record after a reboot. */
  BOOT: 32,
} as const;

export type FlagName = keyof typeof FLAGS;

export function hasFlag(flags: number, flag: FlagName): boolean {
  return (flags & FLAGS[flag]) !== 0;
}

export function flagNames(flags: number): FlagName[] {
  return (Object.keys(FLAGS) as FlagName[]).filter((name) => hasFlag(flags, name));
}

export interface LogHeader {
  readonly version: number;
  readonly deviceId: string;
  readonly impPerKwh: number;
  readonly firmware?: string;
  readonly meterSerial?: string;
  readonly chainPrev?: string;
}

export interface LogRecord {
  /** Position in the file (0-based, records only). */
  readonly index: number;
  /** Canonical minute string as written by the device, e.g. 2026-10-01T00:00Z. */
  readonly minute: string;
  /** Minutes since the Unix epoch (UTC). */
  readonly epochMinute: number;
  readonly pulses: number;
  readonly flags: number;
  readonly hash: string;
}

export interface Digest {
  readonly date: string;
  readonly hash: string;
}

export interface ParsedLog {
  readonly header: LogHeader;
  readonly records: readonly LogRecord[];
  readonly digests: readonly Digest[];
}

export const IST_OFFSET_MINUTES = 330;

export function minuteToEpoch(minute: string): number {
  const ms = Date.parse(minute.replace('Z', ':00Z'));
  return Math.round(ms / 60_000);
}

export function epochToMinute(epochMinute: number): string {
  return `${new Date(epochMinute * 60_000).toISOString().slice(0, 16)}Z`;
}

/** IST calendar date (YYYY-MM-DD) for an epoch minute. */
export function istDate(epochMinute: number): string {
  return new Date((epochMinute + IST_OFFSET_MINUTES) * 60_000).toISOString().slice(0, 10);
}

/** IST clock hour 0-23 for an epoch minute. */
export function istHour(epochMinute: number): number {
  return Math.floor((((epochMinute + IST_OFFSET_MINUTES) % 1440) + 1440) % 1440 / 60);
}

/** Human IST timestamp, e.g. 2026-10-01 05:30 IST. */
export function formatIst(epochMinute: number): string {
  const iso = new Date((epochMinute + IST_OFFSET_MINUTES) * 60_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} IST`;
}

/** Average power in watts implied by a pulse count over a number of minutes. */
export function pulsesToWatts(pulses: number, impPerKwh: number, minutes: number): number {
  return minutes > 0 ? (pulses * 3_600_000) / (impPerKwh * minutes * 60) : 0;
}

export function pulsesToKwh(pulses: number, impPerKwh: number): number {
  return pulses / impPerKwh;
}
