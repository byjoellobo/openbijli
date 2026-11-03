const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrWholeFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export function inr(value: number, whole = false): string {
  return (whole ? inrWholeFmt : inrFmt).format(value);
}

export function num(value: number): string {
  return numFmt.format(value);
}

/** Only http(s) URLs may become links (defence in depth; the data schema enforces it too). */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** Parse a number input, falling back when empty or invalid. */
export function parseNumber(text: string, fallback: number): number {
  const value = Number(text);
  return text.trim() === '' || !Number.isFinite(value) ? fallback : value;
}
