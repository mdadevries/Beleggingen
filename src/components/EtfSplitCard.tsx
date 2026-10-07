import React, { useMemo } from 'react';
import { StockPosition } from '../data/types.ts';
import { isEtf } from '../data/stockProfiles.ts';
import { formatEuro, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { Card } from './Card.tsx';
import { shortName } from '../utils/names.ts';

const ETF_COLOR = 'rgb(var(--series-1))';
const STOCK_COLOR = 'rgb(var(--series-2))';

/** ETF's (breed gespreid) tegenover losse aandelen (meer risico per positie), in één balk. */
export const EtfSplitCard: React.FC<{ positions: StockPosition[]; onSelectStock: (ticker: string) => void }> = ({
  positions,
  onSelectStock,
}) => {
  const data = useMemo(() => {
    const etfs = positions.filter((p) => isEtf(p.stock));
    const stocks = positions.filter((p) => !isEtf(p.stock));
    const sum = (list: StockPosition[]) => list.reduce((s, p) => s + p.currentValue, 0);
    const total = sum(positions);
    const biggest = [...stocks].sort((a, b) => b.currentValue - a.currentValue)[0];
    return { etfs, stocks, total, etfValue: sum(etfs), stockValue: sum(stocks), biggest };
  }, [positions]);

  if (data.total <= 0) return null;
  const etfShare = data.etfValue / data.total;
  const stockShare = data.stockValue / data.total;

  const Row: React.FC<{ color: string; label: string; count: number; value: number; share: number }> = ({
    color,
    label,
    count,
    value,
    share,
  }) => (
    <div className="flex items-center gap-3 py-2">
      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">{label}</p>
        <p className="text-xs text-[rgb(var(--text-muted))]">
          {count} {count === 1 ? 'positie' : 'posities'}
        </p>
      </div>
      <div className="text-right tabular">
        <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">{formatPercentPlain(share, 0)}</p>
        <p className="text-xs text-[rgb(var(--text-muted))]">
          <Private>{formatEuro(value)}</Private>
        </p>
      </div>
    </div>
  );

  return (
    <Card title="ETF's en losse aandelen" subtitle="Hoe breed is je geld gespreid?" className="min-w-0">
      <div
        className="flex h-4 rounded-full overflow-hidden bg-[rgb(var(--border))]"
        role="img"
        aria-label={`ETF's ${formatPercentPlain(etfShare, 0)}, losse aandelen ${formatPercentPlain(stockShare, 0)}`}
      >
        {etfShare > 0 && <div style={{ width: `${etfShare * 100}%`, background: ETF_COLOR }} />}
        {stockShare > 0 && <div style={{ width: `${stockShare * 100}%`, background: STOCK_COLOR }} />}
      </div>

      <div className="mt-3 divide-y divide-[rgb(var(--border))]">
        <Row color={ETF_COLOR} label="ETF's" count={data.etfs.length} value={data.etfValue} share={etfShare} />
        <Row color={STOCK_COLOR} label="Losse aandelen" count={data.stocks.length} value={data.stockValue} share={stockShare} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[rgb(var(--text-muted))]">
        Een ETF bevat veel bedrijven tegelijk. Een los aandeel is één bedrijf: meer kans op winst, maar ook op verlies.
        {data.biggest && (
          <>
            {' '}Je grootste losse aandeel is{' '}
            <button
              type="button"
              onClick={() => onSelectStock(data.biggest.stock.ticker)}
              className="font-semibold text-[rgb(var(--accent-text))] hover:underline"
            >
              {shortName(data.biggest.stock.name)}
            </button>{' '}
            ({formatPercentPlain(data.biggest.allocation, 1)} van het totaal).
          </>
        )}
      </p>
    </Card>
  );
};
