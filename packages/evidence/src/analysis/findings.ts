export type Severity = 'high' | 'medium' | 'low' | 'info' | 'ok';

export interface Finding {
  readonly id: string;
  readonly severity: Severity;
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
}

export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2, info: 3, ok: 4 };

export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function kwh(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} kWh`;
}

export function rupees(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
