import { useEffect, useState } from 'react';
import { LogoMark } from './components/LogoMark';
import { SiteFooter } from './components/SiteFooter';
import { REPO_URL } from './lib/site';
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

  useEffect(() => {
    const label = ROUTES.find((r) => r.id === route)?.label;
    document.title = label ? `${label} | OpenBijli` : 'OpenBijli';
  }, [route]);

  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="masthead">
        <div className="masthead-inner">
          <a className="brand" href="#/bill" aria-label="OpenBijli home">
            <LogoMark size={30} />
            OpenBijli
          </a>
          <nav aria-label="Sections">
            {ROUTES.map((r) => (
              <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
          <a className="repo-link" href={REPO_URL}>
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            Source code
          </a>
        </div>
      </header>
      <main id="content" tabIndex={-1}>
        {route === 'bill' && <BillPage />}
        {route === 'solar' && <SolarPage />}
        {route === 'sakshi' && <SakshiPage />}
        {route === 'data' && <DataPage focus={location.sub} />}
      </main>
      <SiteFooter />
    </>
  );
}
