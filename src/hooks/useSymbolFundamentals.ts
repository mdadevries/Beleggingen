import { useEffect, useState } from 'react';
import { Fundamentals } from './useStockData.ts';

const memory = new Map<string, Fundamentals>();

/** Live kerncijfers (Finnhub) voor Amerikaanse symbolen die je niet hebt. Niet in de demo. */
export function useSymbolFundamentals(symbols: string[], enabled: boolean) {
  const key = symbols.filter(Boolean).sort().join(',');
  const [data, setData] = useState<Record<string, Fundamentals>>({});

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const list = key.split(',');
    const out: Record<string, Fundamentals> = {};
    for (const s of list) if (memory.has(s)) out[s] = memory.get(s)!;
    setData({ ...out });
    list
      .filter((s) => !memory.has(s))
      .forEach((s) => {
        fetch(`/api/quotes?symbolfund=${encodeURIComponent(s)}`)
          .then((r) => (r.ok ? r.json() : { available: false }))
          .catch(() => ({ available: false }))
          .then((d: Fundamentals) => {
            memory.set(s, d);
            if (!cancelled) setData((prev) => ({ ...prev, [s]: d }));
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return data;
}
