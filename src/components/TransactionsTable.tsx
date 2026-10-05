import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import { Stock, Transaction } from '../data/types.ts';
import { TransactionBadge } from './TransactionBadge.tsx';
import { formatDate, formatEuroPrecise } from '../utils/portfolio.ts';

interface TransactionsTableProps {
  transactions: Transaction[];
  stocks: Stock[];
}

export const TransactionsTable: React.FC<TransactionsTableProps> = ({ transactions, stocks }) => {
  const [tickerFilter, setTickerFilter] = useState<string>('alle');
  const [query, setQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false); // standaard: nieuwste eerst

  const stockByTicker = useMemo(() => new Map(stocks.map((s) => [s.ticker, s])), [stocks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions
      .filter((tx) => tickerFilter === 'alle' || tx.ticker === tickerFilter)
      .filter((tx) => {
        if (!q) return true;
        const stockName = stockByTicker.get(tx.ticker)?.name?.toLowerCase() ?? '';
        return tx.ticker.toLowerCase().includes(q) || stockName.includes(q);
      })
      .sort((a, b) => (sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
  }, [transactions, tickerFilter, query, sortAsc, stockByTicker]);

  return (
    <div>
      {/* Filters — één rij, boven de tabel */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[rgb(var(--text-muted))] absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op aandeel..."
            aria-label="Zoek op aandeelnaam of ticker"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-sm text-[rgb(var(--text-primary))] placeholder:text-[rgb(var(--text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--series-1))]/40"
          />
        </div>
        <select
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          aria-label="Filter op aandeel"
          className="px-3 py-2.5 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-sm text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--series-1))]/40"
        >
          <option value="alle">Alle aandelen</option>
          {stocks.map((s) => (
            <option key={s.ticker} value={s.ticker}>
              {s.ticker}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel — horizontaal scrollbaar op smalle schermen */}
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[560px] sm:min-w-0 text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border-strong))] text-left">
              <th className="py-2.5 px-4 sm:px-3 font-semibold text-[rgb(var(--text-secondary))]">
                <button
                  type="button"
                  onClick={() => setSortAsc((prev) => !prev)}
                  className="inline-flex items-center gap-1 hover:text-[rgb(var(--text-primary))]"
                >
                  Datum
                  <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="py-2.5 px-3 font-semibold text-[rgb(var(--text-secondary))]">Aandeel</th>
              <th className="py-2.5 px-3 font-semibold text-[rgb(var(--text-secondary))]">Type</th>
              <th className="py-2.5 px-3 font-semibold text-[rgb(var(--text-secondary))] text-right">
                Aantal
              </th>
              <th className="py-2.5 px-3 font-semibold text-[rgb(var(--text-secondary))] text-right">
                Koers
              </th>
              <th className="py-2.5 px-4 sm:px-3 font-semibold text-[rgb(var(--text-secondary))] text-right">
                Totaal
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((tx) => (
              <tr key={tx.id} className="border-b border-[rgb(var(--border))] last:border-0">
                <td className="py-3 px-4 sm:px-3 text-[rgb(var(--text-secondary))] tabular whitespace-nowrap">
                  {formatDate(tx.date)}
                </td>
                <td className="py-3 px-3 font-semibold text-[rgb(var(--text-primary))]">
                  {tx.ticker}
                  <span className="hidden md:inline text-[rgb(var(--text-muted))] font-normal">
                    {' '}
                    · {stockByTicker.get(tx.ticker)?.name}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <TransactionBadge type={tx.type} />
                </td>
                <td className="py-3 px-3 text-right tabular text-[rgb(var(--text-secondary))]">
                  {tx.quantity}
                </td>
                <td className="py-3 px-3 text-right tabular text-[rgb(var(--text-secondary))]">
                  {formatEuroPrecise(tx.price)}
                </td>
                <td className="py-3 px-4 sm:px-3 text-right tabular font-semibold text-[rgb(var(--text-primary))]">
                  {formatEuroPrecise(tx.quantity * tx.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-sm text-[rgb(var(--text-muted))] italic py-8 text-center">
            Geen transacties gevonden.
          </p>
        )}
      </div>
    </div>
  );
};
