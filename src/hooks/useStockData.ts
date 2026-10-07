import { useEffect, useState } from 'react';

export type HistoryPoints = [string, number][]; // [datum (yyyy-mm-dd), koers in euro]

export interface HistoryState {
  status: 'loading' | 'ok' | 'error';
  points: HistoryPoints;
  source?: string;
  updatedAt?: string;
}

export interface Fundamentals {
  available: boolean;
  industry?: string | null;
  country?: string | null;
  ipo?: string | null;
  website?: string | null;
  marketCapEur?: number | null;
  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  grossMargin?: number | null;
  netMargin?: number | null;
  roe?: number | null;
  revenueGrowth?: number | null;
}

/**
 * Haalt de echte koershistorie en de kerncijfers van één aandeel op (alleen in de echte versie;
 * de demo gebruikt het geschatte verloop). De server bewaart beide een dag, dus dit kost je
 * bijna niets aan koersenbudget.
 */
export function useStockData(ticker: string, enabled: boolean) {
  const [history, setHistory] = useState<HistoryState>({ status: 'loading', points: [] });
  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setHistory({ status: 'loading', points: [] });
    setFundamentals(null);
    const t = encodeURIComponent(ticker);

    fetch(`/api/quotes?history=${t}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { points?: HistoryPoints; source?: string; updatedAt?: string }) => {
        if (cancelled) return;
        const points = Array.isArray(d.points) ? d.points : [];
        setHistory(points.length > 4 ? { status: 'ok', points, source: d.source, updatedAt: d.updatedAt } : { status: 'error', points: [] });
      })
      .catch(() => !cancelled && setHistory({ status: 'error', points: [] }));

    fetch(`/api/quotes?fundamentals=${t}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Fundamentals) => !cancelled && setFundamentals(d))
      .catch(() => !cancelled && setFundamentals({ available: false }));

    return () => {
      cancelled = true;
    };
  }, [ticker, enabled]);

  return { history, fundamentals };
}
