import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { QuoteInfo, QuoteSource, Stock } from '../data/types.ts';
import { formatEuroPrecise } from '../utils/portfolio.ts';

const SOURCE_LABEL: Record<QuoteSource, string> = {
  twelvedata: 'Twelve Data',
  justetf: 'justETF',
  finnhub: 'Finnhub',
  yahoo: 'Yahoo (reserve)',
  transactieprijs: 'Laatste transactieprijs',
};

const SOURCE_STYLE: Record<QuoteSource, string> = {
  twelvedata: 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] border-transparent',
  justetf: 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] border-transparent',
  finnhub: 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] border-transparent',
  yahoo: 'bg-[rgb(var(--surface-sunken))] text-[rgb(var(--text-secondary))] border-[rgb(var(--border))]',
  transactieprijs:
    'bg-[rgb(var(--banner-bg))] text-[rgb(var(--banner-text))] border-[rgb(var(--banner-border))]',
};

const SourceBadge: React.FC<{ source: QuoteSource }> = ({ source }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[source]}`}
  >
    {SOURCE_LABEL[source]}
  </span>
);

const STEPS: { title: string; text: string }[] = [
  {
    title: "ETF's: justETF",
    text: "Voor ETF's vraagt de site de koers op bij justETF, op het ISIN-nummer. Die bron is gratis en geeft de koers meteen in euro's, plus de koersgrafiek.",
  },
  {
    title: 'Losse aandelen: Twelve Data',
    text: 'Voor losse aandelen eerst Twelve Data, met je eigen sleutel. Dat is een officiële bron, maar het gratis plan geeft 8 koersen per minuut.',
  },
  {
    title: 'Amerikaanse aandelen: Finnhub',
    text: 'Lukt Twelve Data niet, dan probeert de site Finnhub voor aandelen op Amerikaanse beurzen (zoals Nasdaq). Het aandeel wordt opgezocht op ISIN, nooit op naam.',
  },
  {
    title: 'Vangnet: Yahoo en justETF',
    text: 'Daarna Yahoo (onofficieel) en als laatste justETF. Lukt ook dat niet, dan blijft je laatste transactieprijs staan, en dat staat er dan bij.',
  },
];

/** Uitleg: in welke volgorde de koersen binnenkomen en wat de site daarmee doet. */
export const QuoteFlow: React.FC = () => (
  <div>
    <ol className="space-y-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span
            className="shrink-0 w-6 h-6 rounded-full bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] text-xs font-bold text-[rgb(var(--text-secondary))] flex items-center justify-center"
            aria-hidden="true"
          >
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">{step.title}</p>
            <p className="text-xs text-[rgb(var(--text-secondary))] mt-0.5">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
    <ul className="mt-4 pt-4 border-t border-[rgb(var(--border))] space-y-1.5 text-xs text-[rgb(var(--text-muted))]">
      <li>Elke werkdag na beurssluiting worden alle koersen automatisch bijgewerkt. Met "Nu verversen" kan het tussendoor, hooguit één keer per uur.</li>
      <li>Alles wordt omgerekend naar euro (ook koersen in dollars of pence).</li>
      <li>Wijkt een koers meer dan 15% af van je laatste transactieprijs, dan staat er "controleer deze koers".</li>
    </ul>
  </div>
);

const formatAsOf = (iso?: string): string =>
  iso ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

/** Tabel: per aandeel de bron, het symbool, de koers in euro en wanneer die gold. */
export const QuoteSourcesTable: React.FC<{ stocks: Stock[]; quotes: QuoteInfo[] }> = ({ stocks, quotes }) => {
  const byTicker = new Map(quotes.map((q) => [q.ticker, q]));

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full min-w-[560px] sm:min-w-0 text-sm">
        <thead>
          <tr className="border-b border-[rgb(var(--border-strong))] text-left text-[rgb(var(--text-secondary))]">
            <th className="py-2.5 px-4 sm:px-3 font-semibold">Aandeel</th>
            <th className="py-2.5 px-3 font-semibold">Bron</th>
            <th className="py-2.5 px-3 font-semibold">Symbool</th>
            <th className="py-2.5 px-3 font-semibold text-right">Koers</th>
            <th className="py-2.5 px-4 sm:px-3 font-semibold text-right">Tijdstip</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const q = byTicker.get(stock.ticker);
            return (
              <tr key={stock.ticker} className="border-b border-[rgb(var(--border))] align-top">
                <td className="py-3 px-4 sm:px-3">
                  <p className="font-semibold text-[rgb(var(--text-primary))]">{stock.ticker}</p>
                  <p className="text-xs text-[rgb(var(--text-muted))]">{stock.name}</p>
                </td>
                <td className="py-3 px-3">
                  {q ? <SourceBadge source={q.source} /> : <span className="text-[rgb(var(--text-muted))]">—</span>}
                  {q?.note && <p className="mt-1 text-xs text-[rgb(var(--text-muted))] max-w-[240px]">{q.note}</p>}
                  {q?.warning && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-[rgb(var(--status-critical))] max-w-[240px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
                      <span>{q.warning}</span>
                    </p>
                  )}
                </td>
                <td className="py-3 px-3 text-[rgb(var(--text-secondary))]">
                  {q?.symbol ?? '—'}
                  {q?.currency && <span className="text-xs text-[rgb(var(--text-muted))]"> · {q.currency}</span>}
                </td>
                <td className="py-3 px-3 text-right font-medium text-[rgb(var(--text-primary))] tabular-nums">
                  {formatEuroPrecise(q?.price ?? stock.currentPrice)}
                </td>
                <td className="py-3 px-4 sm:px-3 text-right text-xs text-[rgb(var(--text-muted))] tabular-nums">
                  {formatAsOf(q?.asOf)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
