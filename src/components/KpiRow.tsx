import React from 'react';
import { TrendingUp, TrendingDown, Layers, PiggyBank } from 'lucide-react';
import { PortfolioTotals } from '../utils/portfolio.ts';
import { formatEuro, formatPercent } from '../utils/portfolio.ts';

interface KpiRowProps {
  totals: PortfolioTotals;
  /** Toon het ingelegde bedrag alleen als de data dat betrouwbaar aankan. */
  showInvested: boolean;
}

const StatTile: React.FC<{
  label: string;
  value: string;
  delta?: { text: string; positive: boolean };
  icon: React.ReactNode;
}> = ({ label, value, delta, icon }) => (
  <div className="rounded-2xl bg-white border border-[rgb(var(--border))] p-4 sm:p-5 shadow-sm">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-[rgb(var(--text-muted))]">{label}</span>
      <span className="text-[rgb(var(--text-muted))]">{icon}</span>
    </div>
    <p className="text-2xl sm:text-[1.75rem] font-bold text-[rgb(var(--text-primary))] leading-tight">
      {value}
    </p>
    {delta && (
      <p
        className={`mt-1 text-sm font-semibold flex items-center gap-1 ${
          delta.positive ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'
        }`}
      >
        {delta.positive ? (
          <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span>{delta.text}</span>
      </p>
    )}
  </div>
);

export const KpiRow: React.FC<KpiRowProps> = ({ totals, showInvested }) => {
  const isPositive = totals.totalProfitLoss >= 0;

  return (
    <div
      className={`grid grid-cols-2 ${
        showInvested ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
      } gap-3 sm:gap-4`}
    >
      <StatTile
        label="Totale waarde"
        value={formatEuro(totals.totalValue)}
        icon={<Layers className="w-4 h-4" aria-hidden="true" />}
      />
      <StatTile
        label="Resultaat"
        value={formatEuro(totals.totalProfitLoss)}
        delta={{ text: formatPercent(totals.totalProfitLossPct), positive: isPositive }}
        icon={
          isPositive ? (
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <TrendingDown className="w-4 h-4" aria-hidden="true" />
          )
        }
      />
      <StatTile
        label="Aantal aandelen"
        value={String(totals.numberOfStocks)}
        icon={<Layers className="w-4 h-4" aria-hidden="true" />}
      />
      {showInvested && (
        <StatTile
          label="Ingelegd"
          value={formatEuro(totals.totalInvested)}
          icon={<PiggyBank className="w-4 h-4" aria-hidden="true" />}
        />
      )}
    </div>
  );
};
