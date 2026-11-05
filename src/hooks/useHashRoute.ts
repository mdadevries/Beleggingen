import { useCallback, useEffect, useState } from 'react';

export type Page =
  | 'overzicht'
  | 'transacties'
  | 'inzicht'
  | 'race'
  | 'toekomst'
  | 'chat'
  | 'wrapped'
  | 'weekrapport'
  | 'studieschuld'
  | 'koersen';

const PAGES: Page[] = ['transacties', 'inzicht', 'race', 'toekomst', 'chat', 'wrapped', 'weekrapport', 'studieschuld', 'koersen'];
export interface Route {
  page: Page;
  /** Gevuld op de detailpagina van een aandeel */
  ticker: string | null;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'aandeel' && parts[1]) return { page: 'overzicht', ticker: decodeURIComponent(parts[1]) };
  if (PAGES.includes(parts[0] as Page)) return { page: parts[0] as Page, ticker: null };
  return { page: 'overzicht', ticker: null };
}

/**
 * Eenvoudige routing via de #-hash (#/overzicht, #/transacties, #/aandeel/ASML).
 * Zo werkt de terugknop van je browser/telefoon en kun je een aandeel delen
 * zonder extra server-instellingen.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => {
      const next = parse(window.location.hash);
      setRoute(next);
      // Wrapped is een laag over de pagina: niet naar boven springen.
      if (next.page !== 'wrapped') window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const goPage = useCallback((page: Page) => {
    window.location.hash = `#/${page}`;
  }, []);
  const goStock = useCallback((ticker: string) => {
    window.location.hash = `#/aandeel/${encodeURIComponent(ticker)}`;
  }, []);

  return { route, goPage, goStock };
}
