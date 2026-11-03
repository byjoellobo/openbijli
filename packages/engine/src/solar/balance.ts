/**
 * Monthly energy balance from a representative day: hour by hour, solar first serves
 * the house; any excess is exported and any shortfall imported.
 *
 * Using an average day understates exports on bright days and imports on cloudy ones,
 * so self-consumption is slightly optimistic. The error is small next to tariff and
 * load-profile uncertainty, and it keeps the model transparent.
 */

export interface MonthBalanceInput {
  readonly consumptionKwh: number;
  readonly days: number;
  readonly sizeKw: number;
  /** AC kWh per kWp per day for this month (after performance ratio and degradation). */
  readonly dailyYieldPerKwp: number;
  readonly generationShape: readonly number[];
  readonly loadShape: readonly number[];
}

export interface MonthBalance {
  readonly consumption: number;
  readonly generation: number;
  readonly selfConsumed: number;
  readonly imported: number;
  readonly exported: number;
  /** Imported kWh per clock hour, summed over the month (for ToD billing). */
  readonly importedByHour: readonly number[];
  /** Consumption per clock hour, summed over the month. */
  readonly consumptionByHour: readonly number[];
}

export function monthBalance(input: MonthBalanceInput): MonthBalance {
  const dailyLoad = input.consumptionKwh / input.days;
  const dailyGeneration = input.sizeKw * input.dailyYieldPerKwp;
  const importedByHour: number[] = [];
  const consumptionByHour: number[] = [];
  let selfConsumed = 0;
  let imported = 0;
  let exported = 0;

  for (let hour = 0; hour < 24; hour += 1) {
    const load = dailyLoad * (input.loadShape[hour] ?? 0);
    const generation = dailyGeneration * (input.generationShape[hour] ?? 0);
    const self = Math.min(load, generation);
    selfConsumed += self;
    imported += load - self;
    exported += generation - self;
    importedByHour.push((load - self) * input.days);
    consumptionByHour.push(load * input.days);
  }

  return {
    consumption: input.consumptionKwh,
    generation: dailyGeneration * input.days,
    selfConsumed: selfConsumed * input.days,
    imported: imported * input.days,
    exported: exported * input.days,
    importedByHour,
    consumptionByHour,
  };
}
