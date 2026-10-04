import { useEffect, useState } from 'react';
import { Stock, Transaction } from '../data/types.ts';
import { DEMO_STOCKS, DEMO_TRANSACTIONS } from '../data/demoData.ts';

interface PortfolioData {
  stocks: Stock[];
  transactions: Transaction[];
  isDemo: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Haalt echte transacties/aandelen op bij /api/transactions (gevuld door de
 * n8n-koppeling met Gmail). Zolang daar nog niets binnen is — of bij een
 * netwerkfout — val je terug op demodata, zodat de site nooit leeg oogt.
 */
export function usePortfolioData(): PortfolioData {
  const [state, setState] = useState<PortfolioData>({
    stocks: DEMO_STOCKS,
    transactions: DEMO_TRANSACTIONS,
    isDemo: true,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

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
            loading: false,
            error: null,
          });
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Onbekende fout' }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
