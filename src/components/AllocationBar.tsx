import React from 'react';
import { StockPosition } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatEuro, formatPercent } from '../utils/portfolio.ts';

interface AllocationBarProps {
  positions: StockPosition[];
}

/**
 * Verdeling per aandeel als horizontale gestapelde balk (part-to-whole).
 * Elk segment >= 8% krijgt een direct label; kleinere segmenten leunen op
 * de legenda eronder. 2px surface-gap tussen segmenten i.p.v. een rand.
 */
export const AllocationBar: React.FC<AllocationBarProps> = ({ positions }) => {
  if (positions.length === 0) {
    return (
      <p className="text-sm text-[rgb(var(--text-muted))] italic">
        Nog geen posities om te verdelen.
      </p>
    );
  }

  return (
    <div>
      <div
        className="flex w-full h-8 sm:h-9 rounded-lg overflow-hidden"
        role="img"
        aria-label={`Verdeling van de portefeuille: ${positions
          .map((p) => `${p.stock.ticker} ${formatPercent(p.allocation).replace('+', '')}`)
          .join(', ')}`}
      >
        {positions.map((p, idx) => (
          <div
            key={p.stock.ticker}
            className="h-full flex items-center justify-center relative group"
            style={{
              width: `${Math.max(p.allocation * 100, 0.5)}%`,
              backgroundColor: seriesColor(p.stock.colorSlot),
              marginLeft: idx === 0 ? 0 : 2,
            }}
            title={`${p.stock.name}: ${formatPercent(p.allocation).replace('+', '')} · ${formatEuro(
              p.currentValue
            )}`}
          >
            {p.allocation >= 0.08 && (
              <span className="text-[11px] font-semibold text-white px-1 truncate hidden sm:inline">
                {p.stock.ticker}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Legenda — altijd aanwezig bij >=2 series, draagt de identiteit */}
      <ul className="mt-3.5 flex flex-wrap gap-x-4 gap-y-2">
        {positions.map((p) => (
          <li key={p.stock.ticker} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: seriesColor(p.stock.colorSlot) }}
              aria-hidden="true"
            />
            <span className="font-semibold text-[rgb(var(--text-primary))]">{p.stock.ticker}</span>
            <span className="text-[rgb(var(--text-muted))]">
              {formatPercent(p.allocation).replace('+', '')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
