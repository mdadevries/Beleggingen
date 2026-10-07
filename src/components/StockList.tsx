import React from 'react';
import { ChevronRight } from 'lucide-react';
import { MarketInfo, StockPosition } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatEuro, formatEuroPrecise, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';

interface StockListProps {
  positions: StockPosition[];
  market: Record<string, MarketInfo>;
  onSelect: (ticker: string) => void;
}

const tone = (v: number) => (v >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]');

/** Alle aandelen die je hebt, grootste eerst. Klik op een rij voor het overzicht van dat aandeel. */
export const StockList: React.FC<StockListProps> = ({ positions, market, onSelect }) => {
  if (positions.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen aandelen in bezit.</p>;
  }
  return (
    <ul className="-mx-2 sm:-mx-3 divide-y divide-[rgb(var(--border))]">
      {positions.map((p) => {
        const m = market[p.stock.ticker];
        return (
          <li key={p.stock.ticker}>
            <button
              type="button"
              onClick={() => onSelect(p.stock.ticker)}
              className="w-full flex items-center gap-3 px-2 sm:px-3 py-3.5 text-left rounded-xl hover:bg-[rgb(var(--surface-sunken))] transition-colors"
            >
              <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: seriesColor(p.stock.colorSlot) }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{p.stock.name}</span>
                <span className="block text-xs text-[rgb(var(--text-muted))] tabular">
                  {p.stock.ticker} · {formatPercentPlain(p.allocation, 0)} van je portefeuille
                </span>
              </span>
              <span className="hidden sm:block text-right shrink-0 w-28">
                <span className="block text-sm text-[rgb(var(--text-primary))] tabular">{formatEuroPrecise(p.stock.currentPrice)}</span>
                {m?.changePct != null ? (
                  <span className={`block text-xs tabular ${tone(m.changePct)}`}>{formatPercent(m.changePct)} vandaag</span>
                ) : (
                  <span className="block text-xs text-[rgb(var(--text-muted))]">koers</span>
                )}
              </span>
              <span className="text-right shrink-0 w-24 sm:w-28">
                <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] tabular">
                  <Private>{formatEuro(p.currentValue)}</Private>
                </span>
                {p.invested > 0 && <span className={`block text-xs tabular ${tone(p.profitLossPct)}`}>{formatPercent(p.profitLossPct)}</span>}
              </span>
              <ChevronRight className="w-4 h-4 shrink-0 text-[rgb(var(--text-muted))]" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
