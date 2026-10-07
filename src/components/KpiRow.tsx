import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { StockPosition } from '../data/types.ts';
import { PortfolioTotals, formatEuro, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';

interface KpiRowProps {
  totals: PortfolioTotals;
  positions: StockPosition[];
  /** Toon het ingelegde bedrag alleen als de data dat betrouwbaar aankan. */
  showInvested: boolean;
  onSelectStock: (ticker: string) => void;
}

const Stat: React.FC<{ label: string; children: React.ReactNode; onClick?: () => void }> = ({ label, children, onClick }) => {
  const inner = (
    <>
      <span className="block text-xs text-[rgb(var(--text-muted))]">{label}</span>
      <span className="block mt-0.5 text-base sm:text-lg font-semibold text-[rgb(var(--text-primary))] tabular">{children}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left rounded-lg hover:bg-[rgb(var(--surface-sunken))] -mx-2 px-2 py-1 transition-colors">
      {inner}
    </button>
  ) : (
    <div className="py-1">{inner}</div>
  );
};

/** Bovenaan: totale waarde en resultaat groot, daaronder de belangrijkste kerncijfers. */
export const KpiRow: React.FC<KpiRowProps> = ({ totals, positions, showInvested, onSelectStock }) => {
  const isPositive = totals.totalProfitLoss >= 0;
  const withCost = positions.filter((p) => p.invested > 0);
  const best = withCost.length > 1 ? [...withCost].sort((a, b) => b.profitLossPct - a.profitLossPct)[0] : null;
  const largest = positions.length > 1 ? positions[0] : null;

  const { hidden } = usePrivacy();
  const resultColor = isPositive ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]';

  return (
    <section className="rounded-2xl bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-5 sm:p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04)] grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-medium text-[rgb(var(--text-muted))]">
          {hidden && showInvested ? 'Rendement sinds aankoop' : 'Totale waarde'}
        </p>
        {hidden && showInvested ? (
          <p className={`mt-1 text-4xl sm:text-5xl font-bold tracking-tight tabular ${resultColor}`}>
            {formatPercent(totals.totalProfitLossPct)}
          </p>
        ) : (
          <p className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight text-[rgb(var(--text-primary))] tabular">
            <Private>{formatEuro(totals.totalValue)}</Private>
          </p>
        )}
        {showInvested && !hidden && (
          <p className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${resultColor}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" aria-hidden="true" /> : <TrendingDown className="w-4 h-4" aria-hidden="true" />}
            <span className="tabular">
              {formatEuro(totals.totalProfitLoss)} ({formatPercent(totals.totalProfitLossPct)})
            </span>
            <span className="font-normal text-[rgb(var(--text-muted))]">sinds aankoop</span>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 pt-5 border-t border-[rgb(var(--border))] md:pt-0 md:border-t-0 md:pl-8 md:border-l md:min-w-[22rem]">
        {showInvested && (
          <Stat label="Ingelegd">
            <Private>{formatEuro(totals.totalInvested)}</Private>
          </Stat>
        )}
        <Stat label="Aantal aandelen">{totals.numberOfStocks}</Stat>
        {best && (
          <Stat label="Beste aandeel" onClick={() => onSelectStock(best.stock.ticker)}>
            {best.stock.ticker}{' '}
            <span className={best.profitLossPct >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}>
              {formatPercent(best.profitLossPct)}
            </span>
          </Stat>
        )}
        {largest && (
          <Stat label="Grootste positie" onClick={() => onSelectStock(largest.stock.ticker)}>
            {largest.stock.ticker} <span className="text-[rgb(var(--text-secondary))]">{formatPercentPlain(largest.allocation, 0)}</span>
          </Stat>
        )}
      </dl>
    </section>
  );
};
