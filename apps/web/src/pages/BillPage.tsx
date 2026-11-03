import { useMemo, useState } from 'react';
import { computeBill, type Bill } from '@openbijli/engine';
import type { ContextFlag } from '@openbijli/data';
import { BillSheet } from '../components/BillSheet';
import { ResultBar } from '../components/ResultBar';
import { UtilitySelect } from '../components/UtilitySelect';
import { DEFAULT_UTILITY, bookFor, cycleWord } from '../lib/catalog';
import { inr, parseNumber } from '../lib/format';

export function BillPage() {
  const [utilityId, setUtilityId] = useState(DEFAULT_UTILITY);
  const [units, setUnits] = useState('200');
  const [load, setLoad] = useState('3');
  const [phase, setPhase] = useState<'single' | 'three'>('single');
  const [area, setArea] = useState<'urban' | 'rural'>('urban');
  const [smartMeter, setSmartMeter] = useState(false);
  const [prepaid, setPrepaid] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [todUnits, setTodUnits] = useState<Record<string, string>>({});

  const book = bookFor(utilityId);
  const category = book.categories[0];
  const optInSchemes = category?.subsidies.filter((s) => s.optIn) ?? [];
  const needsBaseline = optInSchemes.some((s) => s.rule === 'entitlement');
  const tod = category?.tod;
  const showTod = tod !== undefined && smartMeter;

  const result = useMemo((): { bill: Bill; raw: Bill } | { error: string } => {
    const flags: ContextFlag[] = [...(smartMeter ? (['smart_meter'] as const) : []), ...(prepaid ? (['prepaid'] as const) : [])];
    const split = showTod
      ? Object.fromEntries(Object.entries(todUnits).map(([k, v]) => [k, parseNumber(v, 0)]).filter(([, v]) => (v as number) > 0))
      : undefined;
    const input = {
      utilityId,
      units: parseNumber(units, 0),
      sanctionedLoadKw: parseNumber(load, 1),
      phase,
      area,
      flags,
      ...(split && Object.keys(split).length > 0 ? { todUnits: split } : {}),
    };
    try {
      const bill = computeBill(book, {
        ...input,
        subsidies: { apply: enrolled ? true : 'automatic', ...(baseline ? { baselineUnits: parseNumber(baseline, 0) } : {}) },
      });
      const raw = computeBill(book, { ...input, subsidies: { apply: false } });
      return { bill, raw };
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [book, utilityId, units, load, phase, area, smartMeter, prepaid, enrolled, baseline, showTod, todUnits]);

  const utility = book.utilities.find((u) => u.id === utilityId);
  return (
    <>
      <h1>What should your electricity bill be?</h1>
      <p className="lede">
        Enter the units on your bill. Every charge below is worked out from your state regulator's tariff order, with a
        numbered link to the page it comes from.
      </p>
      <div className="workbench">
        <form className="controls" onSubmit={(e) => e.preventDefault()}>
          <UtilitySelect value={utilityId} onChange={(id) => { setUtilityId(id); setTodUnits({}); }} />
          <div className="row">
            <label className="field">
              <span>Units used</span>
              <input type="number" min="0" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} />
              <small>kWh in one {cycleWord(book) === 'month' ? 'monthly' : 'two-month'} bill ("units consumed")</small>
            </label>
            <label className="field">
              <span>Sanctioned load</span>
              <input type="number" min="0.25" step="0.25" inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} />
              <small>kW, printed on the bill (also "contract load")</small>
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>Connection</span>
              <select value={phase} onChange={(e) => setPhase(e.target.value as 'single' | 'three')}>
                <option value="single">Single-phase</option>
                <option value="three">Three-phase</option>
              </select>
            </label>
            <label className="field">
              <span>Area</span>
              <select value={area} onChange={(e) => setArea(e.target.value as 'urban' | 'rural')}>
                <option value="urban">Urban</option>
                <option value="rural">Rural</option>
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Meter</legend>
            <label className="check">
              <input type="checkbox" checked={smartMeter} onChange={(e) => setSmartMeter(e.target.checked)} />
              <span>Smart meter installed</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} />
              <span>Prepaid</span>
            </label>
          </fieldset>
          {showTod && tod && (
            <fieldset>
              <legend>Units by time of day</legend>
              <small className="hint">{tod.applicability}</small>
              {tod.periods.map((p) => (
                <label className="field" key={p.id}>
                  <span>
                    {p.name} ({p.windows.map((w) => `${w.from}-${w.to}`).join(', ')})
                  </span>
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={todUnits[p.id] ?? ''}
                    onChange={(e) => setTodUnits({ ...todUnits, [p.id]: e.target.value })}
                  />
                </label>
              ))}
            </fieldset>
          )}
          {optInSchemes.length > 0 && (
            <fieldset>
              <legend>Government schemes</legend>
              <label className="check">
                <input type="checkbox" checked={enrolled} onChange={(e) => setEnrolled(e.target.checked)} />
                <span>My household is enrolled in {optInSchemes.map((s) => s.name).join(' / ')}</span>
              </label>
              {enrolled && needsBaseline && (
                <label className="field">
                  <span>Your scheme baseline</span>
                  <input type="number" min="0" inputMode="decimal" value={baseline} onChange={(e) => setBaseline(e.target.value)} />
                  <small>Average monthly units the scheme uses for your household (shown on your bill)</small>
                </label>
              )}
            </fieldset>
          )}
        </form>
        <section id="result" aria-live="polite" className="result">
          {'error' in result ? (
            <p className="error">{result.error}</p>
          ) : (
            <>
              <ResultBar targetId="result" label="Your bill" value={inr(result.bill.total)} />
              <BillSheet
                bill={result.bill}
                title={`${utility?.shortName ?? utilityId} ${category?.code ?? ''} bill`}
                subtitle={`${book.regulator.short} tariff for FY ${book.financialYear}, ${result.bill.consumptionUnits} kWh per ${cycleWord(book)}`}
              />
              {result.raw.total !== result.bill.total && (
                <p className="compare">
                  <span>
                    Regulator's tariff: <strong>{inr(result.raw.total)}</strong>
                  </span>
                  <span>
                    Government pays: <strong>{inr(result.raw.total - result.bill.total)}</strong>
                  </span>
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
