import React, { useMemo } from 'react';
import { MarketInfo, StockPosition, Transaction } from '../data/types.ts';
import { computeDividends } from '../utils/dividends.ts';
import { OTHER_COLOR } from '../utils/colors.ts';
import { formatDate, formatEuro, formatEuroPrecise, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { Card } from './Card.tsx';
import { shortName } from '../utils/names.ts';

interface DividendCardProps {
  positions: StockPosition[];
  transactions: Transaction[];
  market: Record<string, MarketInfo>;
  colors: Record<string, string>;
  onSelectStock: (ticker: string) => void;
}

/** Dividend: wat je het afgelopen jaar kreeg en wat je ongeveer het komende jaar verwacht. */
export const DividendCard: React.FC<DividendCardProps> = ({ positions, transactions, market, colors, onSelectStock }) => {
  const d = useMemo(() => computeDividends(positions, transactions, market), [positions, transactions, market]);
  const noInfo = d.rows.length === 0 && d.noDividend.length === 0;
  const max = d.rows[0]?.expected || 1;

  return (
    <Card
      title="Dividend"
      subtitle="Geschat op wat je aandelen het afgelopen jaar uitkeerden"
      className="min-w-0"
    >
      {noInfo ? (
        <p className="text-sm text-[rgb(var(--text-muted))]">
          Nog geen dividendgegevens. Die verschijnen zodra de live koersen binnen zijn.
        </p>
      ) : d.rows.length === 0 ? (
        <p className="text-sm text-[rgb(var(--text-secondary))]">
          Geen van je aandelen keerde het afgelopen jaar dividend uit. Accumulerende ETF's herbeleggen het dividend zelf, dus
          daar zie je niets.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[rgb(var(--text-muted))]">Verwacht komend jaar</p>
              <p className="text-2xl font-bold tabular text-[rgb(var(--text-primary))]">
                <Private>{formatEuro(d.expected)}</Private>
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))] tabular">{formatPercentPlain(d.yieldPct, 1)} van je portefeuille</p>
            </div>
            <div>
              <p className="text-xs text-[rgb(var(--text-muted))]">Afgelopen 12 maanden</p>
              <p className="text-2xl font-bold tabular text-[rgb(var(--text-primary))]">
                <Private>{formatEuro(d.received)}</Private>
              </p>
              <p className="text-xs text-[rgb(var(--text-muted))]">ontvangen (geschat)</p>
            </div>
          </div>

          <ul className="mt-4 space-y-3">
            {d.rows.map((r) => (
              <li key={r.ticker}>
                <button type="button" onClick={() => onSelectStock(r.ticker)} className="w-full text-left group">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-[rgb(var(--text-primary))] group-hover:underline truncate">
                      {shortName(r.name)}
                    </span>
                    <span className="text-sm font-semibold tabular text-[rgb(var(--text-primary))]">
                      <Private>{formatEuroPrecise(r.expected)}</Private>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[rgb(var(--border))] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(3, (r.expected / max) * 100)}%`, background: colors[r.ticker] ?? OTHER_COLOR }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[rgb(var(--text-muted))] tabular">
                    {formatPercentPlain(r.yieldPct, 1)} rendement · {r.payments}× per jaar · laatst {formatDate(r.lastDate)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {d.rows.length > 0 && (d.noDividend.length > 0 || d.unknown.length > 0) && (
        <p className="mt-4 text-xs text-[rgb(var(--text-muted))]">
          {d.noDividend.length > 0 && <>Geen dividend: {d.noDividend.join(', ')}. </>}
          {d.unknown.length > 0 && <>Onbekend (geen live koers): {d.unknown.join(', ')}.</>}
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[rgb(var(--text-muted))]">
        Bruto, dus vóór bronbelasting. Dit is een schatting en geen belofte: een bedrijf kan het dividend verlagen of schrappen.
      </p>
    </Card>
  );
};
