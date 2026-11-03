import type { SizeResult } from '@openbijli/engine';
import { inr } from '../lib/format';

interface SizeChartProps {
  sizes: readonly SizeResult[];
  bestKw: number | null;
}

/**
 * Money left over after 25 years for each size, as horizontal bars. HTML rather than SVG
 * so labels stay legible on a phone; sizes that lose money show a short red bar.
 */
export function SizeChart({ sizes, bestKw }: SizeChartProps) {
  const feasible = sizes.filter((s) => s.feasible && s.npv !== null);
  if (feasible.length === 0) return null;
  const max = feasible.reduce((m, s) => Math.max(m, Math.abs(s.npv ?? 0)), 1);

  return (
    <ul className="bars" aria-label="Money left over after 25 years, by system size">
      {feasible.map((s) => {
        const value = s.npv ?? 0;
        const best = s.sizeKw === bestKw;
        const payback = s.simplePaybackYears === null ? 'never pays back' : `pays back in ${s.simplePaybackYears.toFixed(1)} years`;
        return (
          <li key={s.sizeKw} className={best ? 'best' : undefined}>
            <span className="bar-size">
              {s.sizeKw} kW{best && <em>recommended</em>}
            </span>
            <span className="bar-track" aria-hidden="true">
              <span className={`bar-fill${value < 0 ? ' loss' : ''}`} style={{ width: `${Math.max(2, (Math.abs(value) / max) * 100)}%` }} />
            </span>
            <span className="bar-value">
              <strong>{inr(value, true)}</strong> {value < 0 ? 'loss' : 'gain'}, {payback}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
