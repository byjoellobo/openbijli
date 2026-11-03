import { catalog } from '@openbijli/data';
import { APP_VERSION, LINKS } from '../lib/site';
import { LogoMark } from './LogoMark';

const bookCount = catalog.books.length;
const utilityCount = catalog.books.reduce((n, b) => n + b.utilities.length, 0);
const years = [...new Set(catalog.books.map((b) => b.financialYear))].toSorted().join(', ');

export function SiteFooter() {
  return (
    <footer className="colophon">
      <div className="colophon-inner">
        <section className="colophon-about" aria-label="About OpenBijli">
          <p className="colophon-brand">
            <LogoMark size={26} />
            OpenBijli
          </p>
          <p>
            Rates come from {bookCount} state regulators' tariff orders for <span className="nowrap">FY {years}</span>, covering{' '}
            {utilityCount} electricity companies.
            Each line on a bill links to the page that sets it.
          </p>
          <p>Everything runs in your browser. Nothing you enter is sent anywhere.</p>
        </section>
        <nav className="colophon-links" aria-label="Project">
          <h2>Project</h2>
          <ul>
            <li>
              <a href={LINKS.source}>Source code on GitHub</a>
            </li>
            <li>
              <a href={LINKS.docs}>Documentation</a>
            </li>
            <li>
              <a href={LINKS.wrongNumber}>Report a wrong number</a>
            </li>
            <li>
              <a href={LINKS.newOrder}>Tell us about a new tariff order</a>
            </li>
            <li>
              <a href={LINKS.hardware}>Build a Meter Sakshi</a>
            </li>
          </ul>
        </nav>
        <nav className="colophon-links" aria-label="Licences">
          <h2>Licences</h2>
          <ul>
            <li>
              <a href={LINKS.codeLicence}>Code: MIT</a>
            </li>
            <li>
              <a href={LINKS.dataLicence}>Tariff data: CC BY 4.0</a>
            </li>
            <li>
              <a href={LINKS.hardwareLicence}>Hardware: CERN-OHL-P-2.0</a>
            </li>
            <li>
              <a href={LINKS.releases}>Version {APP_VERSION}</a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
