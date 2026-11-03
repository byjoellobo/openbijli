import { useEffect, useState } from 'react';
import { BillPage } from './pages/BillPage';
import { DataPage } from './pages/DataPage';
import { SakshiPage } from './pages/SakshiPage';
import { SolarPage } from './pages/SolarPage';

type Route = 'bill' | 'solar' | 'sakshi' | 'data';

const ROUTES: readonly { id: Route; label: string }[] = [
  { id: 'bill', label: 'Check a bill' },
  { id: 'solar', label: 'Size rooftop solar' },
  { id: 'sakshi', label: 'Dispute a bill' },
  { id: 'data', label: 'Tariff data' },
];

interface Location {
  route: Route;
  /** Optional second segment, e.g. a tariff book id in #/data/ka-kerc. */
  sub?: string;
}

function locationFromHash(): Location {
  const [id, sub] = window.location.hash.replace(/^#\/?/, '').split('/');
  const route = ROUTES.some((r) => r.id === id) ? (id as Route) : 'bill';
  return sub ? { route, sub: decodeURIComponent(sub) } : { route };
}

export function App() {
  const [location, setLocation] = useState<Location>(locationFromHash);

  useEffect(() => {
    const onHash = () => {
      const next = locationFromHash();
      setLocation(next);
      if (!next.sub) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const { route } = location;
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="masthead">
        <a className="brand" href="#/bill">
          <span className="brand-led" aria-hidden="true" />
          Open Tariff India
        </a>
        <nav aria-label="Sections">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        {route === 'bill' && <BillPage />}
        {route === 'solar' && <SolarPage />}
        {route === 'sakshi' && <SakshiPage />}
        {route === 'data' && <DataPage focus={location.sub} />}
      </main>
      <footer className="colophon">
        <p>
          Rates come from state regulators' tariff orders, each linked from the line it sets. Everything runs in your browser;
          nothing you enter is sent anywhere.
        </p>
        <p>Code MIT. Tariff data CC BY 4.0.</p>
      </footer>
    </>
  );
}
