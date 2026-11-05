import { useEffect, useMemo, useState } from 'react';
import { Transaction } from '../data/types.ts';
import { Points } from '../utils/history.ts';
import { BENCHMARKS } from '../data/benchmarks.ts';
import { demoHistory } from '../data/demoHistory.ts';

/**
 * Laadt de echte dagkoersen van alles wat je ooit hebt gehad, plus de indexen voor de race.
 * De server bewaart elke reeks een dag, dus dit kost je koersenbudget bijna niets. We vragen
 * er hooguit twee tegelijk op, zodat het gratis budget per minuut niet in één keer op is.
 * Alles blijft in het geheugen van de pagina: wisselen van tab laadt niets opnieuw.
 */

type Status = 'idle' | 'loading' | 'done';
const memory = new Map<string, Points | null>();
const inflight = new Map<string, Promise<Points | null>>();

function fetchPoints(url: string): Promise<Points | null> {
  if (memory.has(url)) return Promise.resolve(memory.get(url)!);
  const running = inflight.get(url);
  if (running) return running;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { points?: Points } | null) => {
      const pts = d && Array.isArray(d.points) && d.points.length > 4 ? d.points : null;
      memory.set(url, pts);
      return pts;
    })
    .catch(() => {
      memory.set(url, null);
      return null;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

async function runLimited<T>(jobs: (() => Promise<T>)[], limit = 2) {
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) await jobs[i++]();
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

export interface HistoriesState {
  status: Status;
  histories: Record<string, Points>;
  benchmarks: Record<string, Points>;
}

export function useHistories(transactions: Transaction[], isDemo: boolean, ready: boolean): HistoriesState {
  const tickers = useMemo(() => [...new Set(transactions.map((t) => t.ticker))].sort().join(','), [transactions]);
  const [state, setState] = useState<HistoriesState>({ status: 'idle', histories: {}, benchmarks: {} });

  useEffect(() => {
    if (!ready) return;
    if (isDemo) {
      const d = demoHistory();
      setState({ status: 'done', histories: d.histories, benchmarks: d.benchmarks });
      return;
    }
    let cancelled = false;
    const list = tickers ? tickers.split(',') : [];
    const histories: Record<string, Points> = {};
    const benchmarks: Record<string, Points> = {};
    setState((s) => ({ ...s, status: 'loading' }));
    const push = () => !cancelled && setState({ status: 'loading', histories: { ...histories }, benchmarks: { ...benchmarks } });
    // Eerst de indexen (gratis via justETF), daarna je eigen aandelen.
    const jobs = [
      ...BENCHMARKS.map((b) => async () => {
        const pts = await fetchPoints(`/api/quotes?benchmark=${b.id}`);
        if (pts) benchmarks[b.id] = pts;
        push();
      }),
      ...list.map((t) => async () => {
        const pts = await fetchPoints(`/api/quotes?history=${encodeURIComponent(t)}`);
        if (pts) histories[t] = pts;
        push();
      }),
    ];
    runLimited(jobs, 2).then(() => !cancelled && setState({ status: 'done', histories: { ...histories }, benchmarks: { ...benchmarks } }));
    return () => {
      cancelled = true;
    };
  }, [tickers, isDemo, ready]);

  return state;
}

/** Koershistorie van concurrenten (alleen geladen als je de pagina met duels opent). */
export function usePeerHistories(symbols: string[], isDemo: boolean) {
  const key = [...new Set(symbols)].sort().join(',');
  const [peers, setPeers] = useState<Record<string, Points>>({});
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (!key) {
      setStatus('done');
      return;
    }
    if (isDemo) {
      setPeers(demoHistory().peers);
      setStatus('done');
      return;
    }
    let cancelled = false;
    const out: Record<string, Points> = {};
    setStatus('loading');
    runLimited(
      key.split(',').map((s) => async () => {
        const pts = await fetchPoints(`/api/quotes?peer=${encodeURIComponent(s)}`);
        if (pts) out[s] = pts;
        if (!cancelled) setPeers({ ...out });
      }),
      2
    ).then(() => !cancelled && setStatus('done'));
    return () => {
      cancelled = true;
    };
  }, [key, isDemo]);

  return { peers, status };
}
