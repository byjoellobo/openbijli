import { useEffect } from 'react';
import { catalog, type AdditionalCharge, type TariffBook } from '@open-tariff-india/data';
import { MarkLegend, VerificationMark } from '../components/Legend';
import { safeHref } from '../lib/format';

const money = (value: number): string => `₹${value.toFixed(2)}`;

const LINE_NAMES: Readonly<Record<string, string>> = { energy: 'energy charge', fixed: 'fixed charge', tod: 'time-of-day charge' };

function slabText(slabs: readonly { upTo: number | null; rate: number }[]): string {
  let lower = 0;
  return slabs
    .map((s) => {
      const range = s.upTo === null ? (lower === 0 ? 'all units' : `above ${lower}`) : `${lower}-${s.upTo}`;
      lower = s.upTo ?? lower;
      return `${range}: ₹${s.rate.toFixed(2)}`;
    })
    .join(', ');
}

function chargeText(c: AdditionalCharge, book: TariffBook, chargeNames: Map<string, string>): string {
  const names = (ids: readonly string[]) => ids.map((id) => LINE_NAMES[id] ?? chargeNames.get(id) ?? id).join(' + ');
  const utilities = c.utilities ? ` (${c.utilities.map((id) => book.utilities.find((u) => u.id === id)?.shortName ?? id).join(', ')} only)` : '';
  switch (c.kind) {
    case 'per_kwh':
      return `${money(c.rate)} per unit${utilities}`;
    case 'percent':
      return `${c.percent}% of ${names(c.of)}${utilities}`;
    case 'flat':
      return `₹${c.amount} per ${c.period === 'month' ? 'month' : 'bill'}${utilities}`;
    case 'flat_by_units':
      return `₹${c.bands.map((b) => b.amount).join(' / ')} depending on units used${utilities}`;
    case 'per_solar_kw':
      return `₹${c.amount} per kW of rooftop solar per month${utilities}`;
    case 'per_solar_kwh':
      return `${money(c.rate)} per unit of solar generated${utilities}`;
  }
}

function settlementText(r: TariffBook['rooftopSolar']['regimes'][number]): string {
  const rate = r.exportRate.value === null ? 'rate not published' : `₹${r.exportRate.value} per unit`;
  const when = r.settlement.period === 'billing_cycle' ? 'every bill' : r.settlement.period === 'financial_year' ? 'each March' : 'once a year';
  return `Surplus ${r.settlement.surplus === 'lapses' ? 'lapses unpaid' : `paid at ${rate}`}, settled ${when}`;
}

function Book({ book, open }: { book: TariffBook; open: boolean }) {
  const category = book.categories[0];
  const cycle = category?.billingCycle === 'bimonthly' ? 'per two-month bill' : 'per month';
  const chargeNames = new Map(category?.charges.map((c) => [c.id, c.name]) ?? []);
  return (
    <details className="book" id={`book-${book.bookId}`} open={open}>
      <summary>
        <span className="book-title">
          {book.state}: {book.utilities.map((u) => u.shortName).join(', ')}
        </span>
        <span className="book-meta">
          {book.regulator.short}, FY {book.financialYear}
          <span className={`badge ${book.status}`}>{book.status === 'complete' ? 'complete' : `${book.gaps.length} known gaps`}</span>
        </span>
      </summary>
      <p>
        In force from {book.effectiveFrom}. {book.order.title.replace(/\.+$/, '')}.
      </p>
      {category && (
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {category.energy.schedules.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="left">
                    Energy {s.label ? `(${s.label})` : ''} <VerificationMark level={category.energy.verification} />
                    <small className="cell-note">{s.method === 'whole' ? 'all units at one rate' : 'each block at its own rate'}, units {cycle}</small>
                  </th>
                  <td className="left">{slabText(s.slabs)}</td>
                </tr>
              ))}
              {category.charges.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="left">
                    {c.name} <VerificationMark level={c.verification} />
                  </th>
                  <td className="left">{chargeText(c, book, chargeNames)}</td>
                </tr>
              ))}
              {category.subsidies.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="left">
                    {s.name} <VerificationMark level={s.verification} />
                    <small className="cell-note">{s.optIn ? 'only for registered households' : 'automatic'}</small>
                  </th>
                  <td className="left">{s.eligibility}</td>
                </tr>
              ))}
              {book.rooftopSolar.regimes.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="left">
                    {r.label}
                    {r.default ? ' (usual for homes)' : ''} <VerificationMark level={r.verification} />
                  </th>
                  <td className="left">{settlementText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>What is missing</h3>
      <ul className="gaps">
        {book.gaps.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <details className="sources-list">
        <summary>Sources ({Object.keys(book.sources).length})</summary>
        <ol className="gaps">
          {Object.entries(book.sources).map(([key, s]) => (
            <li key={key}>
              {safeHref(s.url) ? (
                <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
              , {s.publisher}
              {s.date ? `, ${s.date}` : ''}
              {s.sha256 ? '. Fingerprinted.' : ''}
            </li>
          ))}
        </ol>
      </details>
    </details>
  );
}

export function DataPage({ focus }: { focus?: string }) {
  const books = [...catalog.books].toSorted((a, b) => a.state.localeCompare(b.state));
  const utilities = books.reduce((n, b) => n + b.utilities.length, 0);

  useEffect(() => {
    if (focus) document.getElementById(`book-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  return (
    <>
      <h1>The tariff data behind every number</h1>
      <p className="lede">
        {books.length} states, {utilities} electricity companies. Open a state to see its rates, what is still missing, and the orders
        they come from.
      </p>
      <MarkLegend />
      <nav className="state-index" aria-label="States">
        {books.map((b) => (
          <a key={b.bookId} href={`#/data/${b.bookId}`}>
            {b.state}
          </a>
        ))}
      </nav>
      {books.map((b) => (
        <Book key={`${b.bookId}-${b.financialYear}`} book={b} open={focus === b.bookId} />
      ))}
      <p className="hint">
        Spotted a wrong number or a new tariff order? Each year's orders arrive as pull requests that a reviewer checks against the
        source PDF; the files live in <code>data/tariffs/</code> in the project repository.
      </p>
    </>
  );
}
