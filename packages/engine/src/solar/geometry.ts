/**
 * Hour-by-hour shape of a typical day's solar output, from sun position.
 *
 * India runs on one clock (IST, UTC+5:30, referenced to 82.5°E), so solar noon in
 * Mangaluru (74.9°E) falls near 12:40 IST but near 11:50 in Kolkata. That shift
 * matters for ToD windows such as "09:00–17:00 solar hours", so we convert clock
 * time to apparent solar time (longitude correction + equation of time).
 */

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
/** Klein's representative day of year for each month. */
const REPRESENTATIVE_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344] as const;
const IST_MERIDIAN = 82.5;
const SUBSTEPS = 6;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Equation of time in minutes (Spencer/Cooper approximation). */
export function equationOfTimeMinutes(dayOfYear: number): number {
  const b = rad((360 * (dayOfYear - 81)) / 364);
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export function declinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin(rad((360 * (284 + dayOfYear)) / 365));
}

/** cos(zenith) at a clock time (IST hours, fractional). Negative = sun below horizon. */
export function cosZenith(latDeg: number, lonDeg: number, dayOfYear: number, istHours: number): number {
  const solarHours = istHours + (lonDeg - IST_MERIDIAN) / 15 + equationOfTimeMinutes(dayOfYear) / 60;
  const hourAngle = rad(15 * (solarHours - 12));
  const lat = rad(latDeg);
  const dec = rad(declinationDeg(dayOfYear));
  return Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
}

/** 24 fractions (sum 1) of a representative day's PV output for a calendar month (0 = Jan). */
export function hourlyGenerationShape(latDeg: number, lonDeg: number, monthIndex: number): number[] {
  const day = REPRESENTATIVE_DAY[monthIndex];
  if (day === undefined) throw new RangeError(`monthIndex must be 0-11 (got ${monthIndex})`);
  const weights = Array.from({ length: 24 }, (_, hour) => {
    let weight = 0;
    for (let step = 0; step < SUBSTEPS; step += 1) {
      weight += Math.max(0, cosZenith(latDeg, lonDeg, day, hour + (step + 0.5) / SUBSTEPS));
    }
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
}
