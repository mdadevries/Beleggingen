import { useEffect, useState } from 'react';
import { Stock, Transaction } from '../data/types.ts';
import { DEMO_STOCKS, DEMO_TRANSACTIONS } from '../data/demoData.ts';

export type DemoReason = 'account' | 'no-data' | null;

interface PortfolioData {
  stocks: Stock[];
  transactions: Transaction[];
  isDemo: boolean;
  /** Waarom er demodata getoond wordt: expliciet demo-account, of (nog) geen
   *  echte transacties. Bepaalt welke banner-tekst Nav toont. null = geen demo. */
  demoReason: DemoReason;
  loading: boolean;
  error: string | null;
}

/**
 * Bepaalt eerst via /api/session of dit een demo-sessie is (geen wachtwoord,
 * via de "Doorgaan met demo-account"-knop). Een demo-sessie roept
 * /api/transactions nooit aan — zo kan een demo-login nooit per ongeluk
 * echte financiële data laten zien.
 *
 * Voor een echte sessie: haal /api/transactions op. Zolang daar nog niets
 * binnen is — of bij een netwerkfout — val je terug op demodata, zodat de
 * site nooit leeg oogt.
 */
export function usePortfolioData(): PortfolioData {
  const [state, setState] = useState<PortfolioData>({
    stocks: DEMO_STOCKS,
    transactions: DEMO_TRANSACTIONS,
    isDemo: true,
    demoReason: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/session')
      .then((res) => (res.ok ? res.json() : { role: 'real' }))
      // Faalt /api/session (netwerk, geen JSON)? Behandel als gewone sessie:
      // we vallen dan alsnog terug op demodata als er niets binnenkomt, en de
      // pagina blijft nooit op "Laden…" hangen.
      .catch(() => ({ role: 'real' }))
      .then((session: { role: 'real' | 'demo' | 'none' }) => {
        if (cancelled) return;

        if (session.role === 'demo') {
          setState({
            stocks: DEMO_STOCKS,
            transactions: DEMO_TRANSACTIONS,
            isDemo: true,
            demoReason: 'account',
            loading: false,
            error: null,
          });
          return; // nooit /api/transactions aanroepen voor een demo-sessie
        }

        fetch('/api/transactions')
          .then((res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return res.json();
          })
          .then((data: { stocks: Stock[]; transactions: Transaction[] }) => {
            if (cancelled) return;
            if (data.transactions && data.transactions.length > 0) {
              setState({
                stocks: data.stocks,
                transactions: data.transactions,
                isDemo: false,
                demoReason: null,
                loading: false,
                error: null,
              });
            } else {
              setState((s) => ({ ...s, demoReason: 'no-data', loading: false }));
            }
          })
          .catch((err) => {
            if (cancelled) return;
            setState((s) => ({
              ...s,
              demoReason: 'no-data',
              loading: false,
              error: err instanceof Error ? err.message : 'Onbekende fout',
            }));
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
