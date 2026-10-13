import { useEffect, useState } from 'react';
import { WeeklyReport } from '../data/types.ts';
import { DEMO_REPORTS } from '../data/demoData.ts';

interface WeeklyReportsState {
  reports: WeeklyReport[];
  loading: boolean;
  error: string | null;
}

/**
 * Weekrapporten van /api/reports (nieuwste eerst). Een demo-sessie krijgt alleen het
 * voorbeeldrapport en roept de server nooit aan, net als bij de transacties.
 */
export function useWeeklyReports(isDemo: boolean): WeeklyReportsState {
  const [state, setState] = useState<WeeklyReportsState>(
    isDemo ? { reports: DEMO_REPORTS, loading: false, error: null } : { reports: [], loading: true, error: null }
  );

  useEffect(() => {
    if (isDemo) {
      setState({ reports: DEMO_REPORTS, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ reports: [], loading: true, error: null });
    fetch('/api/reports')
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data: { reports?: WeeklyReport[] }) => {
        if (cancelled) return;
        setState({ reports: Array.isArray(data.reports) ? data.reports : [], loading: false, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ reports: [], loading: false, error: 'De rapporten konden niet worden opgehaald.' });
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  return state;
}
