import React, { useState } from 'react';
import { StockPosition } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { PortfolioTotals, formatEuro, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';

interface DonutChartProps {
  positions: StockPosition[];
  totals: PortfolioTotals;
  showInvested: boolean;
  onSelect: (ticker: string) => void;
}

const R = 40;
const C = 2 * Math.PI * R;

/**
 * Cirkeldiagram van je portefeuille. Wijs een stuk aan (of een aandeel in de
 * lijst) en het midden laat zien om welk aandeel het gaat. Klik voor de details.
 */
export const DonutChart: React.FC<DonutChartProps> = ({ positions, totals, showInvested, onSelect }) => {
  const { hidden } = usePrivacy();
  const [active, setActive] = useState<string | null>(null);

  if (positions.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen aandelen in bezit.</p>;
  }

  const gap = positions.length > 1 ? 1.4 : 0;
  let cum = 0;
  const segments = positions.map((p) => {
    const start = cum * C;
    const len = Math.max(0, p.allocation * C - gap);
    cum += p.allocation;
    return { p, start: start + gap / 2, len };
  });
  const activePos = positions.find((p) => p.stock.ticker === active) ?? null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-12 py-2">
      <div className="relative w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full" role="group" aria-label="Cirkeldiagram met de verdeling van je portefeuille">
          <circle cx={50} cy={50} r={R} fill="none" style={{ stroke: 'rgb(var(--border))' }} strokeWidth={13} opacity={0.5} />
          {segments.map(({ p, start, len }) => {
            const isActive = active === p.stock.ticker;
            return (
              <circle
                key={p.stock.ticker}
                cx={50}
                cy={50}
                r={R}
                fill="none"
                stroke={seriesColor(p.stock.colorSlot)}
                strokeWidth={isActive ? 16 : 13}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-start}
                transform="rotate(-90 50 50)"
                opacity={active && !isActive ? 0.35 : 1}
                style={{ cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s' }}
                tabIndex={0}
                role="button"
                aria-label={`${p.stock.name}: ${formatPercentPlain(p.allocation, 0)}`}
                onMouseEnter={() => setActive(p.stock.ticker)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.stock.ticker)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect(p.stock.ticker)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(p.stock.ticker)}
              />
            );
          })}
        </svg>

        {/* Midden */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-12">
          {activePos ? (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))] truncate max-w-full">{activePos.stock.name}</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[rgb(var(--text-primary))] tabular">
                {formatPercentPlain(activePos.allocation, 0)}
              </p>
              <p className="text-xs text-[rgb(var(--text-secondary))] tabular">
                <Private>{formatEuro(activePos.currentValue)}</Private>
                {activePos.invested > 0 && (
                  <span className={activePos.profitLossPct >= 0 ? ' text-[rgb(var(--status-good))]' : ' text-[rgb(var(--status-critical))]'}>
                    {hidden ? '' : ' · '}
                    {formatPercent(activePos.profitLossPct)}
                  </span>
                )}
              </p>
            </>
          ) : hidden && showInvested ? (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))]">Rendement</p>
              <p className={`text-3xl sm:text-4xl font-bold tracking-tight tabular ${totals.totalProfitLoss >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
                {formatPercent(totals.totalProfitLossPct)}
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))]">{positions.length} aandelen</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))]">Totale waarde</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[rgb(var(--text-primary))] tabular">
                <Private>{formatEuro(totals.totalValue)}</Private>
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))]">{positions.length} aandelen</p>
            </>
          )}
        </div>
      </div>

      {/* Legenda */}
      <ul className="w-full max-w-sm divide-y divide-[rgb(var(--border))]">
        {positions.map((p) => (
          <li key={p.stock.ticker}>
            <button
              type="button"
              onClick={() => onSelect(p.stock.ticker)}
              onMouseEnter={() => setActive(p.stock.ticker)}
              onMouseLeave={() => setActive(null)}
              className={`w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left transition-colors ${
                active === p.stock.ticker ? 'bg-[rgb(var(--surface-sunken))]' : ''
              }`}
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seriesColor(p.stock.colorSlot) }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{p.stock.name}</span>
                <span className="block text-xs text-[rgb(var(--text-muted))] tabular">
                  <Private>{formatEuro(p.currentValue)}</Private>
                </span>
              </span>
              <span className="text-base font-bold text-[rgb(var(--text-primary))] tabular">{formatPercentPlain(p.allocation, 0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
