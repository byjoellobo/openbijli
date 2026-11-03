import { hasFlag, istDate, istHour, type LogRecord, type ParsedLog } from '../log/format.js';

export interface Gap {
  readonly startMinute: number;
  /** Exclusive end. */
  readonly endMinute: number;
  readonly minutes: number;
}

export interface WindowStats {
  readonly startMinute: number;
  readonly endMinute: number;
  readonly expectedMinutes: number;
  readonly loggedMinutes: number;
  readonly coverage: number;
  readonly pulses: number;
  readonly kwh: number;
  readonly gaps: readonly Gap[];
  readonly supplyLostMinutes: number;
  readonly sensorFaultMinutes: number;
  readonly unsyncedMinutes: number;
}

export interface DailyPoint {
  readonly date: string;
  readonly kwh: number;
  readonly coverage: number;
}

/** Records sorted by time with a binary-search window helper. */
export class LogIndex {
  readonly records: readonly LogRecord[];
  readonly impPerKwh: number;

  constructor(log: ParsedLog, impPerKwh?: number) {
    this.records = log.records;
    this.impPerKwh = impPerKwh ?? log.header.impPerKwh;
  }

  get firstMinute(): number {
    return this.records[0]?.epochMinute ?? 0;
  }

  get lastMinute(): number {
    return this.records.at(-1)?.epochMinute ?? 0;
  }

  private lowerBound(minute: number): number {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.records[mid]?.epochMinute ?? 0) < minute) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Records with startMinute <= epochMinute < endMinute. */
  slice(startMinute: number, endMinute: number): readonly LogRecord[] {
    return this.records.slice(this.lowerBound(startMinute), this.lowerBound(endMinute));
  }

  window(startMinute: number, endMinute: number): WindowStats {
    const records = this.slice(startMinute, endMinute);
    const gaps: Gap[] = [];
    let cursor = startMinute;
    let pulses = 0;
    let supplyLostMinutes = 0;
    let sensorFaultMinutes = 0;
    let unsyncedMinutes = 0;
    for (const record of records) {
      if (record.epochMinute > cursor) gaps.push({ startMinute: cursor, endMinute: record.epochMinute, minutes: record.epochMinute - cursor });
      cursor = record.epochMinute + 1;
      pulses += record.pulses;
      if (hasFlag(record.flags, 'SUPPLY_LOST')) supplyLostMinutes += 1;
      if (hasFlag(record.flags, 'SENSOR_FAULT')) sensorFaultMinutes += 1;
      if (hasFlag(record.flags, 'CLOCK_UNSYNCED')) unsyncedMinutes += 1;
    }
    if (endMinute > cursor) gaps.push({ startMinute: cursor, endMinute, minutes: endMinute - cursor });
    const expectedMinutes = Math.max(0, endMinute - startMinute);
    return {
      startMinute,
      endMinute,
      expectedMinutes,
      loggedMinutes: records.length,
      coverage: expectedMinutes > 0 ? records.length / expectedMinutes : 0,
      pulses,
      kwh: pulses / this.impPerKwh,
      gaps,
      supplyLostMinutes,
      sensorFaultMinutes,
      unsyncedMinutes,
    };
  }

  daily(): DailyPoint[] {
    const byDay = new Map<string, { pulses: number; minutes: number }>();
    for (const record of this.records) {
      const date = istDate(record.epochMinute);
      const entry = byDay.get(date) ?? { pulses: 0, minutes: 0 };
      byDay.set(date, { pulses: entry.pulses + record.pulses, minutes: entry.minutes + 1 });
    }
    return [...byDay.entries()].map(([date, v]) => ({ date, kwh: v.pulses / this.impPerKwh, coverage: v.minutes / 1440 }));
  }

  /** Average kWh per IST clock hour over logged minutes (hours with no data are 0). */
  hourlyProfile(): number[] {
    const pulses = Array.from({ length: 24 }, () => 0);
    const minutes = Array.from({ length: 24 }, () => 0);
    for (const record of this.records) {
      const hour = istHour(record.epochMinute);
      pulses[hour] = (pulses[hour] ?? 0) + record.pulses;
      minutes[hour] = (minutes[hour] ?? 0) + 1;
    }
    return pulses.map((p, h) => ((minutes[h] ?? 0) > 0 ? (p / this.impPerKwh) * (60 / (minutes[h] ?? 1)) : 0));
  }
}
