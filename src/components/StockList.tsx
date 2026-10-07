import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { MarketInfo, StockPosition } from '../data/types.ts';
import { OTHER_COLOR } from '../utils/colors.ts';
import { formatEuro, formatEuroPrecise, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { shortName } from '../utils/names.ts';

interface StockListProps {
  positions: StockPosition[];
  market: Record<string, MarketInfo>;
  colors: Record<string, string>;
  onSelect: (ticker: string) => void;
}

const tone = (v: number) => (v >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]');

type SortKey = 'waarde' | 'rendement' | 'naam';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'waarde', label: 'Waarde' },
  { id: 'rendement', label: 'Rendement' },
  { id: 'naam', label: 'Naam' },
];

/** Alle aandelen die je hebt. Sorteer op waarde, rendement of naam; klik op een rij voor het overzicht van dat aandeel. */
export const StockList: React.FC<StockListProps> = ({ positions, market, colors, onSelect }) => {
  const [sort, setSort] = useState<SortKey>('waarde');
  const sorted = useMemo(() => {
    const list = [...positions];
    if (sort === 'rendement') list.sort((a, b) => b.profitLossPct - a.profitLossPct);
    else if (sort === 'naam') list.sort((a, b) => a.stock.name.localeCompare(b.stock.name, 'nl'));
    else list.sort((a, b) => b.currentValue - a.currentValue);
    return list;
  }, [positions, sort]);

  if (positions.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen aandelen in bezit.</p>;
  }
  return (
    <div>
      {positions.length > 3 && (
        <div className="mb-2 flex items-center gap-1 text-xs" role="group" aria-label="Sorteren">
          <span className="text-[rgb(var(--text-muted))] mr-1">Sorteer op</span>
          {SORTS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={sort === o.id}
              onClick={() => setSort(o.id)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sort === o.id
                  ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]'
                  : 'text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <ul className="-mx-2 sm:-mx-3 divide-y divide-[rgb(var(--border))]">
        {sorted.map((p) => {
          const m = market[p.stock.ticker];
          return (
            <li key={p.stock.ticker}>
              <button
                type="button"
                onClick={() => onSelect(p.stock.ticker)}
                className="w-full flex items-center gap-3 px-2 sm:px-3 py-3.5 text-left rounded-xl hover:bg-[rgb(var(--surface-sunken))] transition-colors"
              >
                <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: colors[p.stock.ticker] ?? OTHER_COLOR }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate" title={p.stock.name}>{shortName(p.stock.name)}</span>
                  <span className="block text-xs text-[rgb(var(--text-muted))] tabular">
                    {p.stock.ticker} · {formatPercentPlain(p.allocation, p.allocation < 0.1 ? 1 : 0)}
                    <span className="hidden sm:inline"> van je portefeuille</span>
                  </span>
                  {/* Op de telefoon is de koerskolom verborgen: daar de dagverandering hier tonen. */}
                  {m?.changePct != null && (
                    <span className={`sm:hidden block text-xs tabular ${tone(m.changePct)}`}>{formatPercent(m.changePct)} laatste dag</span>
                  )}
                </span>
                <span className="hidden sm:block text-right shrink-0 w-28">
                  <span className="block text-sm text-[rgb(var(--text-primary))] tabular">{formatEuroPrecise(p.stock.currentPrice)}</span>
                  {m?.changePct != null ? (
                    <span className={`block text-xs tabular ${tone(m.changePct)}`}>{formatPercent(m.changePct)} laatste dag</span>
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
    </div>
  );
};
