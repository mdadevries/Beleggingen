import { useCallback, useEffect, useState } from 'react';

export type Page = 'overzicht' | 'transacties' | 'koersen';
export interface Route {
  page: Page;
  /** Gevuld op de detailpagina van een aandeel */
  ticker: string | null;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'aandeel' && parts[1]) return { page: 'overzicht', ticker: decodeURIComponent(parts[1]) };
  if (parts[0] === 'transacties') return { page: 'transacties', ticker: null };
  if (parts[0] === 'koersen') return { page: 'koersen', ticker: null };
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
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
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
