import { CSV_HEADER, LOG_MAGIC, LOG_VERSION, epochToMinute, minuteToEpoch, type Digest, type LogHeader, type LogRecord, type ParsedLog } from './format.js';

export class LogFormatError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`Invalid Meter Sakshi log:\n  ${problems.slice(0, 10).join('\n  ')}${problems.length > 10 ? `\n  ...and ${problems.length - 10} more` : ''}`);
    this.name = 'LogFormatError';
    this.problems = problems;
  }
}

const MINUTE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const HASH_RE = /^[0-9a-f]{64}$/;
// Canonical decimal integers only (no "", "0x10", "1e3", "+5", leading zeros).
const PULSES_RE = /^(0|[1-9]\d{0,4})$/;
const FLAGS_RE = /^(0|[1-9]\d{0,2})$/;
const MAX_PULSES = 65535;
const MAX_FLAGS = 255;
export const MAX_RECORDS = 5_000_000;
export const MAX_CHARS = 512 * 1024 * 1024;
const MAX_PROBLEMS = 100;

class Problems {
  readonly list: string[] = [];
  private dropped = 0;
  add(problem: string): void {
    if (this.list.length < MAX_PROBLEMS) this.list.push(problem);
    else this.dropped += 1;
  }
  get count(): number {
    return this.list.length + this.dropped;
  }
  all(): string[] {
    return this.dropped > 0 ? [...this.list, `${this.dropped} further problem(s) not listed`] : this.list;
  }
}

function parseComment(line: string, fields: Map<string, string>, digests: Digest[], problems: Problems, lineNo: number, afterData: boolean): void {
  const body = line.slice(1).trim();
  if (body.startsWith('digest ')) {
    const [, date, hash] = body.split(/\s+/);
    if (date && hash && /^\d{4}-\d{2}-\d{2}$/.test(date) && HASH_RE.test(hash)) digests.push({ date, hash });
    else problems.add(`line ${lineNo}: malformed digest`);
    return;
  }
  const isMagic = body.startsWith(LOG_MAGIC);
  const eq = body.indexOf('=');
  if (!isMagic && eq <= 0) return; // free-text comment
  if (afterData) {
    problems.add(`line ${lineNo}: header lines must come before the data`);
    return;
  }
  if (isMagic) fields.set('version', body.slice(LOG_MAGIC.length).trim().replace(/^v/, ''));
  else fields.set(body.slice(0, eq).trim(), body.slice(eq + 1).trim());
}

function buildHeader(fields: Map<string, string>, problems: Problems): LogHeader {
  const version = Number(fields.get('version'));
  if (!fields.has('version')) problems.add(`missing "# ${LOG_MAGIC} v${LOG_VERSION}" line`);
  else if (version !== LOG_VERSION) problems.add(`unsupported log version ${fields.get('version')}`);
  const deviceId = fields.get('device_id') ?? '';
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(deviceId)) problems.add('device_id missing or invalid');
  const impText = fields.get('imp_per_kwh') ?? '';
  const impPerKwh = Number(impText);
  if (!/^[1-9]\d{0,5}$/.test(impText) || impPerKwh > 100_000) problems.add('imp_per_kwh missing or invalid');
  const chainPrev = fields.get('chain_prev');
  if (chainPrev !== undefined && !HASH_RE.test(chainPrev)) problems.add('chain_prev is not a 64-character hex hash');
  return {
    version,
    deviceId,
    impPerKwh,
    ...(fields.get('firmware') ? { firmware: fields.get('firmware') as string } : {}),
    ...(fields.get('meter_serial') ? { meterSerial: fields.get('meter_serial') as string } : {}),
    ...(chainPrev ? { chainPrev } : {}),
  };
}

function parseRecord(line: string, lineNo: number, index: number, problems: Problems): LogRecord | null {
  const parts = line.split(',');
  const [minute, pulsesText, flagsText, hash] = parts;
  if (parts.length !== 4 || !minute || !MINUTE_RE.test(minute) || !hash || !HASH_RE.test(hash)) {
    problems.add(`line ${lineNo}: expected "minute_utc,pulses,flags,hash"`);
    return null;
  }
  if (!pulsesText || !flagsText || !PULSES_RE.test(pulsesText) || !FLAGS_RE.test(flagsText)) {
    problems.add(`line ${lineNo}: pulses and flags must be plain non-negative integers`);
    return null;
  }
  const pulses = Number(pulsesText);
  const flags = Number(flagsText);
  if (pulses > MAX_PULSES || flags > MAX_FLAGS) {
    problems.add(`line ${lineNo}: pulses must be at most ${MAX_PULSES} and flags at most ${MAX_FLAGS}`);
    return null;
  }
  const epochMinute = minuteToEpoch(minute);
  // Reject dates that roll over (2026-02-30, 24:00) so the hashed text and the analysed time agree.
  if (!Number.isFinite(epochMinute) || epochToMinute(epochMinute) !== minute) {
    problems.add(`line ${lineNo}: invalid timestamp ${minute}`);
    return null;
  }
  return { index, minute, epochMinute, pulses, flags, hash };
}

/** Parse a Meter Sakshi CSV log. Throws LogFormatError listing the problems found. */
export function parseLog(text: string): ParsedLog {
  if (text.length > MAX_CHARS) throw new LogFormatError([`log is larger than ${MAX_CHARS / 1024 / 1024} MB; export a shorter range`]);
  const problems = new Problems();
  const fields = new Map<string, string>();
  const digests: Digest[] = [];
  const records: LogRecord[] = [];
  let sawColumns = false;
  let previousEpoch = Number.NEGATIVE_INFINITY;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    const lineNo = i + 1;
    if (line === '') continue;
    if (line.startsWith('#')) {
      parseComment(line, fields, digests, problems, lineNo, sawColumns);
      continue;
    }
    if (line === CSV_HEADER) {
      sawColumns = true;
      continue;
    }
    if (records.length >= MAX_RECORDS) {
      problems.add(`more than ${MAX_RECORDS} records; split the export`);
      break;
    }
    const record = parseRecord(line, lineNo, records.length, problems);
    if (!record) continue;
    if (record.epochMinute <= previousEpoch) problems.add(`line ${lineNo}: timestamp ${record.minute} is not after the previous record`);
    previousEpoch = record.epochMinute;
    records.push(record);
  }

  if (!sawColumns) problems.add(`missing column header "${CSV_HEADER}"`);
  const header = buildHeader(fields, problems);
  if (records.length === 0) problems.add('no records');
  if (problems.count > 0) throw new LogFormatError(problems.all());
  return { header, records, digests };
}
