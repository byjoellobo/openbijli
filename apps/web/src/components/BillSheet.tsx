import type { Bill, ResolvedCitation } from '@openbijli/engine';
import { inr, safeHref } from '../lib/format';
import { MarkLegend, VerificationMark } from './Legend';

/** Caveats for a result, with a link to the tariff book's list of known gaps. */
export function Notes({ warnings, bookId }: { warnings: readonly string[]; bookId: string }) {
  return (
    <aside className="notes">
      <h3>Read before relying on this</h3>
      <ul>
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p>
        <a href={`#/data/${bookId}`}>See what is missing from this tariff's data</a>
      </p>
    </aside>
  );
}

interface BillSheetProps {
  bill: Bill;
  title: string;
  subtitle: string;
}

/** Footnote numbers by source URL, in order of first use. */
function numberSources(bill: Bill): { order: ResolvedCitation[]; index: Map<string, number> } {
  const index = new Map<string, number>();
  const order: ResolvedCitation[] = [];
  for (const line of bill.lines) {
    for (const cite of line.cite) {
      const key = cite.url || cite.ref;
      if (!index.has(key)) {
        index.set(key, order.length + 1);
        order.push(cite);
      }
    }
  }
  return { order, index };
}

export function BillSheet({ bill, title, subtitle }: BillSheetProps) {
  const { order, index } = numberSources(bill);
  return (
    <article className="slip" aria-label="Itemised bill">
      <header className="slip-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      <table>
        <tbody>
          {bill.lines.map((line) => {
            const notes = [...new Set(line.cite.map((c) => index.get(c.url || c.ref) ?? 0))];
            return (
              <tr key={line.id}>
                <td>
                  {line.label}
                  <sup>
                    {notes.map((n) => (
                      <a key={n} href={`#source-${n}`} aria-label={`Source ${n}`}>
                        {n}
                      </a>
                    ))}
                  </sup>
                  <VerificationMark level={line.verification} />
                  {line.detail && <span className="line-detail">{line.detail}</span>}
                  {!line.detail && line.quantity !== undefined && line.rate !== undefined && (
                    <span className="line-detail">
                      {line.quantity.toFixed(line.quantity % 1 === 0 ? 0 : 2)} {line.unit} × ₹{line.rate.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className={`amount${line.amount < 0 ? ' credit' : ''}`}>{inr(line.amount)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>
              Total <span className="payable">(rounded: {inr(bill.payable, true)})</span>
            </td>
            <td className="amount">{inr(bill.total)}</td>
          </tr>
        </tfoot>
      </table>
      {bill.warnings.length > 0 && <Notes warnings={bill.warnings} bookId={bill.bookId} />}
      <section className="sources" aria-label="Sources">
        <h3>Sources</h3>
        <MarkLegend />
        <ol>
          {order.map((cite, i) => (
            <li key={cite.url || cite.ref} id={`source-${i + 1}`}>
              {safeHref(cite.url) ? (
                <a href={safeHref(cite.url)} target="_blank" rel="noopener noreferrer">
                  {cite.title}
                </a>
              ) : (
                cite.title
              )}
              , {cite.publisher}
              {cite.page !== undefined && `, ${typeof cite.page === 'number' ? `p.${cite.page}` : cite.page}`}
              {cite.quote && (
                <>
                  : <q>{cite.quote}</q>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
