import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { StockPosition } from '../data/types.ts';
import { OTHER_COLOR } from '../utils/colors.ts';
import { PortfolioTotals, formatEuro, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';

interface DonutChartProps {
  positions: StockPosition[];
  colors: Record<string, string>;
  totals: PortfolioTotals;
  showInvested: boolean;
  onSelect: (ticker: string) => void;
}

const R = 40;
const C = 2 * Math.PI * R;
const TOP = 5;
const REST = '__rest';

/**
 * Cirkeldiagram met de vijf grootste posities in kleur en de rest samen als
 * "Overig" in grijs. Zo blijft het leesbaar, ook met veel aandelen. Wijs een
 * stuk of een regel aan: het midden laat zien om welk aandeel het gaat.
 */
export const DonutChart: React.FC<DonutChartProps> = ({ positions, colors, totals, showInvested, onSelect }) => {
  const { hidden } = usePrivacy();
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (positions.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen aandelen in bezit.</p>;
  }

  const top = positions.slice(0, TOP);
  const rest = positions.slice(TOP);
  const restShare = rest.reduce((s, p) => s + p.allocation, 0);
  const restValue = rest.reduce((s, p) => s + p.currentValue, 0);

  const parts = [
    ...top.map((p) => ({ id: p.stock.ticker, share: p.allocation, color: colors[p.stock.ticker] ?? OTHER_COLOR, label: p.stock.name })),
    ...(rest.length > 0
      ? [{ id: REST, share: restShare, color: OTHER_COLOR, label: `Overig (${rest.length} aandelen)` }]
      : []),
  ];

  const gap = parts.length > 1 ? 1.4 : 0;
  let cum = 0;
  const segments = parts.map((part) => {
    const start = cum * C;
    const len = Math.max(0, part.share * C - gap);
    cum += part.share;
    return { ...part, start: start + gap / 2, len };
  });

  const activePos = top.find((p) => p.stock.ticker === active) ?? null;
  const activeRest = active === REST;

  const handleClick = (id: string) => {
    if (id === REST) setExpanded((e) => !e);
    else onSelect(id);
  };

  const Row: React.FC<{ id: string; color: string; name: string; sub: React.ReactNode; share: number; trailing?: React.ReactNode }> = ({
    id,
    color,
    name,
    sub,
    share,
    trailing,
  }) => (
    <button
      type="button"
      onClick={() => handleClick(id)}
      onMouseEnter={() => setActive(id)}
      onMouseLeave={() => setActive(null)}
      aria-expanded={id === REST ? expanded : undefined}
      className={`w-full flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left transition-colors ${
        active === id ? 'bg-[rgb(var(--surface-sunken))]' : ''
      }`}
    >
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{name}</span>
        <span className="block text-xs text-[rgb(var(--text-muted))] tabular">{sub}</span>
      </span>
      <span className="text-base font-bold text-[rgb(var(--text-primary))] tabular">{formatPercentPlain(share, share < 0.1 ? 1 : 0)}</span>
      {trailing}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-12 py-2">
      <div className="relative w-[260px] h-[260px] sm:w-[300px] sm:h-[300px] shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full" role="group" aria-label="Cirkeldiagram met de verdeling van je portefeuille">
          <circle cx={50} cy={50} r={R} fill="none" style={{ stroke: 'rgb(var(--border))' }} strokeWidth={13} opacity={0.5} />
          {segments.map((seg) => {
            const isActive = active === seg.id;
            return (
              <circle
                key={seg.id}
                cx={50}
                cy={50}
                r={R}
                fill="none"
                stroke={seg.color}
                strokeWidth={isActive ? 16 : 13}
                strokeDasharray={`${seg.len} ${C - seg.len}`}
                strokeDashoffset={-seg.start}
                transform="rotate(-90 50 50)"
                opacity={active && !isActive ? 0.35 : 1}
                style={{ cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s' }}
                tabIndex={0}
                role="button"
                aria-label={`${seg.label}: ${formatPercentPlain(seg.share, 0)}`}
                onMouseEnter={() => setActive(seg.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(seg.id)}
                onBlur={() => setActive(null)}
                onClick={() => handleClick(seg.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick(seg.id)}
              />
            );
          })}
        </svg>

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
          ) : activeRest ? (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))]">Overig · {rest.length} aandelen</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[rgb(var(--text-primary))] tabular">
                {formatPercentPlain(restShare, 0)}
              </p>
              <p className="text-xs text-[rgb(var(--text-secondary))] tabular">
                <Private>{formatEuro(restValue)}</Private>
              </p>
            </>
          ) : hidden && showInvested ? (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))]">Rendement</p>
              <p
                className={`text-3xl sm:text-4xl font-bold tracking-tight tabular ${
                  totals.totalProfitLoss >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'
                }`}
              >
                {formatPercent(totals.totalProfitLossPct)}
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))]">{positions.length} posities</p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-[rgb(var(--text-muted))]">Totale waarde</p>
              <p className="text-3xl sm:text-4xl font-bold tracking-tight text-[rgb(var(--text-primary))] tabular">
                <Private>{formatEuro(totals.totalValue)}</Private>
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))]">{positions.length} posities</p>
            </>
          )}
        </div>
      </div>

      <ul className="w-full max-w-md divide-y divide-[rgb(var(--border))]">
        {top.map((p) => (
          <li key={p.stock.ticker}>
            <Row
              id={p.stock.ticker}
              color={colors[p.stock.ticker] ?? OTHER_COLOR}
              name={p.stock.name}
              sub={<Private>{formatEuro(p.currentValue)}</Private>}
              share={p.allocation}
            />
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <Row
              id={REST}
              color={OTHER_COLOR}
              name={`Overig (${rest.length} aandelen)`}
              sub={<Private>{formatEuro(restValue)}</Private>}
              share={restShare}
              trailing={
                <ChevronDown
                  className={`w-4 h-4 text-[rgb(var(--text-muted))] transition-transform ${expanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              }
            />
            {expanded && (
              <ul className="pb-2 pl-6 space-y-0.5">
                {rest.map((p) => (
                  <li key={p.stock.ticker}>
                    <button
                      type="button"
                      onClick={() => onSelect(p.stock.ticker)}
                      className="w-full flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md text-left text-sm hover:bg-[rgb(var(--surface-sunken))]"
                    >
                      <span className="flex-1 truncate text-[rgb(var(--text-secondary))]">{p.stock.name}</span>
                      <span className="tabular text-[rgb(var(--text-primary))] font-semibold">{formatPercentPlain(p.allocation, 1)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </div>
  );
};
