import React from 'react';
import { Stock, Transaction } from '../data/types.ts';
import { TransactionBadge } from './TransactionBadge.tsx';
import { formatDate, formatEuroPrecise } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { shortName } from '../utils/names.ts';

interface RecentTransactionsProps {
  transactions: Transaction[];
  /** Om de naam te tonen in plaats van de afkorting */
  stocks?: Stock[];
  limit?: number;
  onSelectStock?: (ticker: string) => void;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions, stocks = [], limit = 5, onSelectStock }) => {
  const names = new Map(stocks.map((s) => [s.ticker, shortName(s.name)]));
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);

  if (recent.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen transacties.</p>;
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))]">
      {recent.map((tx) => (
        <li key={tx.id} className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => onSelectStock?.(tx.ticker)} className="text-sm font-semibold text-[rgb(var(--text-primary))] truncate hover:underline">
              {names.get(tx.ticker) ?? tx.ticker}
            </button>
            <p className="text-xs text-[rgb(var(--text-muted))]">{formatDate(tx.date)}</p>
          </div>
          <div className="text-right shrink-0">
            <TransactionBadge type={tx.type} />
            <p className="text-xs text-[rgb(var(--text-muted))] mt-1 tabular">
              <Private>{tx.quantity}</Private> × {formatEuroPrecise(tx.price)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};
