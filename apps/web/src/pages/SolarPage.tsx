import { useMemo, useState } from 'react';
import { getSolarResourceForUtility } from '@openbijli/data';
import { DEFAULT_ASSUMPTIONS, LOAD_PROFILES, simulateSolar, type LoadProfileId, type SolarSimulationResult } from '@openbijli/engine';
import { Notes } from '../components/BillSheet';
import { ResultBar } from '../components/ResultBar';
import { SizeChart } from '../components/SizeChart';
import { UtilitySelect } from '../components/UtilitySelect';
import { DEFAULT_UTILITY, bookFor, centralSubsidy, marketCostPerKw } from '../lib/catalog';
import { inr, num, parseNumber } from '../lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function SolarPage() {
  const [utilityId, setUtilityId] = useState(DEFAULT_UTILITY);
  const [mode, setMode] = useState<'average' | 'monthly'>('average');
  const [average, setAverage] = useState('250');
  const [monthly, setMonthly] = useState<string[]>(() => Array.from({ length: 12 }, () => '250'));
  const [load, setLoad] = useState('3');
  const [roof, setRoof] = useState('');
  const [cost, setCost] = useState(String(marketCostPerKw));
  const [useCfa, setUseCfa] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [profile, setProfile] = useState<LoadProfileId>('evening_peak');
  const [escalation, setEscalation] = useState(String(DEFAULT_ASSUMPTIONS.tariffEscalationPerYear * 100));
  const [discount, setDiscount] = useState(String(DEFAULT_ASSUMPTIONS.discountRate * 100));
  const [degradation, setDegradation] = useState(String(DEFAULT_ASSUMPTIONS.degradationPerYear * 100));

  const book = bookFor(utilityId);
  const optIn = book.categories[0]?.subsidies.filter((s) => s.optIn) ?? [];
  const bimonthly = book.categories[0]?.billingCycle === 'bimonthly';

  const result = useMemo((): SolarSimulationResult | { error: string } => {
    try {
      const months = mode === 'average' ? Array.from({ length: 12 }, () => parseNumber(average, 0)) : monthly.map((m) => parseNumber(m, 0));
      return simulateSolar({
        book,
        utilityId,
        resource: getSolarResourceForUtility(utilityId),
        monthlyConsumptionKwh: months,
        sanctionedLoadKw: parseNumber(load, 3),
        ...(roof ? { roofLimitKw: parseNumber(roof, 10) } : {}),
        costPerKw: parseNumber(cost, marketCostPerKw),
        centralSubsidy: useCfa ? centralSubsidy : null,
        billSubsidies: { apply: enrolled ? true : 'automatic' },
        loadProfile: profile,
        assumptions: {
          tariffEscalationPerYear: parseNumber(escalation, 0) / 100,
          discountRate: parseNumber(discount, 8) / 100,
          degradationPerYear: parseNumber(degradation, 0.8) / 100,
        },
      });
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [book, utilityId, mode, average, monthly, load, roof, cost, useCfa, enrolled, profile, escalation, discount, degradation]);

  return (
    <>
      <h1>How much rooftop solar pays back for your home?</h1>
      <p className="lede">
        We work out your bills for the next 25 years with and without solar, using your company's real rates and what it pays
        for solar you export, and show which size leaves you the most money.
      </p>
      <div className="workbench">
        <form className="controls" onSubmit={(e) => e.preventDefault()}>
          <UtilitySelect value={utilityId} onChange={setUtilityId} />
          <fieldset>
            <legend>Electricity you use now (kWh per month)</legend>
            <div className="segmented" role="group" aria-label="Consumption input">
              <button type="button" aria-pressed={mode === 'average'} onClick={() => setMode('average')}>
                Average month
              </button>
              <button type="button" aria-pressed={mode === 'monthly'} onClick={() => setMode('monthly')}>
                Each month
              </button>
            </div>
            {mode === 'average' ? (
              <input type="number" min="0" inputMode="decimal" aria-label="Average monthly units" value={average} onChange={(e) => setAverage(e.target.value)} />
            ) : (
              <div className="row">
                {MONTHS.map((m, i) => (
                  <label className="field" key={m}>
                    <span>{m}</span>
                    <input type="number" min="0" inputMode="decimal" value={monthly[i]} onChange={(e) => setMonthly(monthly.map((v, j) => (j === i ? e.target.value : v)))} />
                  </label>
                ))}
              </div>
            )}
            {bimonthly && <small className="hint">This utility bills every two months; the simulator pairs months for you.</small>}
          </fieldset>
          <div className="row">
            <label className="field">
              <span>Sanctioned load</span>
              <input type="number" min="0.5" step="0.5" value={load} onChange={(e) => setLoad(e.target.value)} />
              <small>kW</small>
            </label>
            <label className="field">
              <span>Roof space</span>
              <input type="number" min="0" step="0.5" placeholder="no limit" value={roof} onChange={(e) => setRoof(e.target.value)} />
              <small>kW that fit (about 10 m² per kW)</small>
            </label>
          </div>
          <label className="field">
            <span>Installed price per kW, before subsidy</span>
            <input type="number" min="0" step="500" value={cost} onChange={(e) => setCost(e.target.value)} />
            <small>Default is the 2026 market midpoint. Use your vendor's quote if you have one.</small>
          </label>
          <label className="field">
            <span>When you use electricity</span>
            <select value={profile} onChange={(e) => setProfile(e.target.value as LoadProfileId)}>
              {Object.values(LOAD_PROFILES).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <small>{LOAD_PROFILES[profile].description}</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={useCfa} onChange={(e) => setUseCfa(e.target.checked)} />
            <span>Claim the PM Surya Ghar subsidy</span>
          </label>
          {optIn.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={enrolled} onChange={(e) => setEnrolled(e.target.checked)} />
              <span>My household is enrolled in {optIn.map((s) => s.name).join(' / ')}</span>
            </label>
          )}
          <details>
            <summary>Assumptions</summary>
            <div className="controls">
              <label className="field">
                <span>Tariff change per year (%)</span>
                <input type="number" step="0.5" value={escalation} onChange={(e) => setEscalation(e.target.value)} />
                <small>0 is the cautious case.</small>
              </label>
              <label className="field">
                <span>Discount rate (%)</span>
                <input type="number" step="0.5" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <small>What your money would earn elsewhere, e.g. a fixed deposit.</small>
              </label>
              <label className="field">
                <span>Panel output loss per year (%)</span>
                <input type="number" step="0.1" value={degradation} onChange={(e) => setDegradation(e.target.value)} />
                <small>0.8 matches the PM Surya Ghar warranty floor; Indian rooftop surveys measured up to 2.</small>
              </label>
            </div>
          </details>
        </form>
        <section id="result" className="result" aria-live="polite">{'error' in result ? <p className="error">{result.error}</p> : <SolarResult result={result} bookId={book.bookId} />}</section>
      </div>
    </>
  );
}

function SolarResult({ result, bookId }: { result: SolarSimulationResult; bookId: string }) {
  const best = result.recommended;
  const years = result.assumptions.years;
  return (
    <>
      {best && <ResultBar targetId="result" label={`${best.sizeKw} kW saves`} value={`${inr(best.year1?.savings ?? 0, true)}/yr`} />}
      <p className="verdict">
        {best ? (
          <>
            Install <strong>{best.sizeKw} kW</strong>.
          </>
        ) : (
          <>
            At these prices and tariffs, <strong>no size pays for itself</strong> within {years} years.
          </>
        )}
      </p>
      {best?.year1 && (
        <dl className="facts">
          <div>
            <dt>Cost after subsidy</dt>
            <dd>{inr(best.netCost, true)}</dd>
          </div>
          <div>
            <dt>Saving in the first year</dt>
            <dd>{inr(best.year1.savings, true)}</dd>
          </div>
          <div>
            <dt>Pays for itself in</dt>
            <dd>{best.simplePaybackYears === null ? 'more than 25 years' : `${best.simplePaybackYears.toFixed(1)} years`}</dd>
          </div>
        </dl>
      )}
      <ul className="rationale">
        {result.rationale.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <h2>Money left over after {years} years</h2>
      <p className="hint">Savings minus the system's cost and upkeep, in today's money. More is better.</p>
      <SizeChart sizes={result.sizes} bestKw={best?.sizeKw ?? null} />
      {result.sizes.some((s) => !s.feasible) && (
        <ul className="hint">
          {result.sizes
            .filter((s) => !s.feasible)
            .map((s) => (
              <li key={s.sizeKw}>
                {s.sizeKw} kW: {s.infeasibleReason}
              </li>
            ))}
        </ul>
      )}
      <details className="compare-all">
        <summary>Compare every size in detail</summary>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Size</th>
                <th>Cost after subsidy</th>
                <th>Solar units, year 1</th>
                <th>Used at home</th>
                <th>Saving, year 1</th>
                <th>Paid for exports</th>
                <th>Payback</th>
                <th>Left over after {years} yr</th>
              </tr>
            </thead>
            <tbody>
              {result.sizes
                .filter((s) => s.feasible && s.year1)
                .map((s) => (
                  <tr key={s.sizeKw} className={s.sizeKw === best?.sizeKw ? 'best' : undefined}>
                    <td>{s.sizeKw} kW</td>
                    <td>{inr(s.netCost, true)}</td>
                    <td>{num(s.year1?.generation ?? 0)} kWh</td>
                    <td>{Math.round((s.year1?.selfConsumptionRatio ?? 0) * 100)}%</td>
                    <td>{inr(s.year1?.savings ?? 0, true)}</td>
                    <td>{inr(s.year1?.exportIncome ?? 0, true)}</td>
                    <td>{s.simplePaybackYears === null ? 'never' : `${s.simplePaybackYears.toFixed(1)} yr`}</td>
                    <td>{inr(s.npv ?? 0, true)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Your current bills: {inr(result.annualBillWithout, true)} a year for {num(result.annualConsumption)} kWh. Sunlight: NASA
          POWER 2001-2025 averages near {result.resourceId}. "Used at home" is the share of solar you use as it is made; the rest is
          exported.
        </p>
      </details>
      {result.warnings.length > 0 && <Notes warnings={result.warnings} bookId={bookId} />}
    </>
  );
}
