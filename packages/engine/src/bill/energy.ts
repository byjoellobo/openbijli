import type { EnergySchedule } from '@openbijli/data';
import { matchesCondition } from './context.js';
import type { BillContext } from './types.js';

export interface EnergySegment {
  readonly fromUnits: number;
  readonly toUnits: number;
  readonly units: number;
  readonly rate: number;
  readonly amount: number;
}

export class TariffDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TariffDataError';
  }
}

function scheduleMatches(schedule: EnergySchedule, units: number, ctx: BillContext): boolean {
  const when = schedule.when;
  if (!when) return true;
  if (when.aboveUnits !== undefined && !(units > when.aboveUnits)) return false;
  if (when.upToUnits !== undefined && units > when.upToUnits) return false;
  return matchesCondition(when, ctx);
}

/** First schedule whose conditions match. Order in the data file decides priority. */
export function selectSchedule(schedules: readonly EnergySchedule[], units: number, ctx: BillContext): EnergySchedule {
  const schedule = schedules.find((s) => scheduleMatches(s, units, ctx));
  if (!schedule) {
    throw new TariffDataError(
      `No energy schedule matches ${units} kWh (${ctx.area}, ${ctx.phase}-phase, ${ctx.loadKw} kW). Check the category's schedule conditions.`,
    );
  }
  return schedule;
}

/** Split units across slabs and price them. */
export function priceEnergy(schedule: EnergySchedule, units: number): EnergySegment[] {
  if (units <= 0) return [];

  if (schedule.method === 'whole') {
    const slab = schedule.slabs.find((s) => s.upTo === null || units <= s.upTo) ?? schedule.slabs.at(-1);
    if (!slab) return [];
    return [{ fromUnits: 0, toUnits: units, units, rate: slab.rate, amount: units * slab.rate }];
  }

  const segments: EnergySegment[] = [];
  let lower = 0;
  for (const slab of schedule.slabs) {
    const upper = slab.upTo ?? Number.POSITIVE_INFINITY;
    const inSlab = Math.min(units, upper) - lower;
    if (inSlab > 0) {
      segments.push({ fromUnits: lower, toUnits: lower + inSlab, units: inSlab, rate: slab.rate, amount: inSlab * slab.rate });
    }
    if (units <= upper) break;
    lower = upper;
  }
  return segments;
}

/** Energy charge for the first `units` kWh at this schedule's rates (used by free-unit subsidies). */
export function energyForFirstUnits(schedule: EnergySchedule, totalUnits: number, units: number): number {
  const covered = Math.min(units, totalUnits);
  if (covered <= 0) return 0;
  if (schedule.method === 'whole') {
    const segment = priceEnergy(schedule, totalUnits)[0];
    return segment ? covered * segment.rate : 0;
  }
  return priceEnergy(schedule, covered).reduce((total, s) => total + s.amount, 0);
}
