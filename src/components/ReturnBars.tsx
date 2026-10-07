import React from 'react';
import { StockPosition } from '../data/types.ts';
import { formatEuro, formatPercent } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';

interface ReturnBarsProps {
  positions: StockPosition[];
  onSelect: (ticker: string) => void;
}

/** Wat levert elk aandeel op sinds je kocht? Groen naar rechts is winst, rood naar links is verlies. */
export const ReturnBars: React.FC<ReturnBarsProps> = ({ positions, onSelect }) => {
  const rows = positions.filter((p) => p.invested > 0).sort((a, b) => b.profitLossPct - a.profitLossPct);
  if (rows.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen rendement om te tonen.</p>;
  }
  const min = Math.min(0, ...rows.map((r) => r.profitLossPct));
  const max = Math.max(0, ...rows.map((r) => r.profitLossPct));
  const span = max - min || 1;
  const zero = (-min / span) * 100;

  return (
    <div>
      <ul className="space-y-1">
        {rows.map((r) => {
          const w = (Math.abs(r.profitLossPct) / span) * 100;
          const good = r.profitLossPct >= 0;
          return (
            <li key={r.stock.ticker}>
              <button
                type="button"
                onClick={() => onSelect(r.stock.ticker)}
                className="w-full grid grid-cols-[5.5rem_1fr_4.5rem] sm:grid-cols-[9rem_1fr_6rem] items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-[rgb(var(--surface-sunken))]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{r.stock.ticker}</span>
                  <span className="hidden sm:block text-xs text-[rgb(var(--text-muted))] truncate">{r.stock.name}</span>
                </span>
                <span className="relative h-7">
                  <span className="absolute inset-y-0 w-px bg-[rgb(var(--border-strong))]" style={{ left: `${zero}%` }} aria-hidden="true" />
                  <span
                    className={`absolute top-1 bottom-1 rounded-sm ${good ? 'bg-[rgb(var(--status-good-bg))]' : 'bg-[rgb(var(--status-critical))]'}`}
                    style={good ? { left: `${zero}%`, width: `${w}%` } : { left: `${zero - w}%`, width: `${w}%` }}
                  />
                </span>
                <span className="text-right">
                  <span className={`block text-sm font-bold tabular ${good ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
                    {formatPercent(r.profitLossPct)}
                  </span>
                  <span className="block text-xs text-[rgb(var(--text-muted))] tabular">
                    <Private>{formatEuro(r.profitLoss)}</Private>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
