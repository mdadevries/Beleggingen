import React from 'react';
import { Transaction } from '../data/types.ts';
import { TransactionBadge } from './TransactionBadge.tsx';
import { formatDate, formatEuroPrecise } from '../utils/portfolio.ts';

interface RecentTransactionsProps {
  transactions: Transaction[];
  limit?: number;
}

export const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions, limit = 5 }) => {
  const recent = [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);

  if (recent.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen transacties.</p>;
  }

  return (
    <ul className="divide-y divide-[rgb(var(--border))]">
      {recent.map((tx) => (
        <li key={tx.id} className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[rgb(var(--text-primary))] truncate">{tx.ticker}</p>
            <p className="text-xs text-[rgb(var(--text-muted))]">{formatDate(tx.date)}</p>
          </div>
          <div className="text-right shrink-0">
            <TransactionBadge type={tx.type} />
            <p className="text-xs text-[rgb(var(--text-muted))] mt-1 tabular">
              {tx.quantity} × {formatEuroPrecise(tx.price)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};
