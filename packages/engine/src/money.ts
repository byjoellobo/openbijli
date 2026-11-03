/** Round to paise. Bills are computed line by line, each line rounded to 2 decimals. */
export function roundPaise(value: number): number {
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return value < 0 ? -rounded : rounded;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** Rs 1,23,456.78 style (Indian digit grouping). */
export function formatInr(value: number, wholeRupees = false): string {
  return (wholeRupees ? inrWhole : inr).format(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
