import React from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { MarketInfo, StockPosition, Transaction } from '../data/types.ts';
import { findProfile } from '../data/stockProfiles.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatDate, formatEuro, formatEuroPrecise, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { Card } from './Card.tsx';
import { PriceChart } from './PriceChart.tsx';
import { TransactionBadge } from './TransactionBadge.tsx';

interface StockDetailProps {
  position: StockPosition;
  transactions: Transaction[];
  market: MarketInfo | undefined;
  onBack: () => void;
}

const tone = (v: number) => (v >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]');

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[rgb(var(--border))] last:border-0">
    <dt className="text-sm text-[rgb(var(--text-secondary))]">{label}</dt>
    <dd className="text-sm font-semibold text-[rgb(var(--text-primary))] text-right tabular">{children}</dd>
  </div>
);

/** Balk die laat zien waar de koers nu staat tussen het laagste en hoogste punt van het jaar. */
const RangeBar: React.FC<{ low: number; high: number; price: number }> = ({ low, high, price }) => {
  const pos = high > low ? Math.min(1, Math.max(0, (price - low) / (high - low))) : 0.5;
  return (
    <div>
      <div className="relative h-1.5 rounded-full bg-[rgb(var(--border))]">
        <span
          className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--series-1))] border-2 border-[rgb(var(--surface))]"
          style={{ left: `${pos * 100}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-[rgb(var(--text-muted))] tabular">
        <span>{formatEuroPrecise(low)}</span>
        <span>{formatEuroPrecise(high)}</span>
      </div>
    </div>
  );
};

/** Het overzicht van één aandeel: wat het is, hoe het ervoor staat en wat jij ermee deed. */
export const StockDetail: React.FC<StockDetailProps> = ({ position: p, transactions, market, onBack }) => {
  const { stock } = p;
  const profile = findProfile(stock);
  const txs = transactions.filter((t) => t.ticker === stock.ticker).sort((a, b) => b.date.localeCompare(a.date));
  const held = p.sharesHeld > 0;
  const live = market?.live === true;
  const color = seriesColor(stock.colorSlot);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 -ml-1 px-2 py-1.5 rounded-lg text-sm font-medium text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Terug naar overzicht
      </button>

      {/* Kop: naam, koers, dagverandering */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-l-4 pl-4" style={{ borderColor: color }}>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[rgb(var(--text-primary))]">{stock.name}</h1>
          <p className="mt-1 text-sm text-[rgb(var(--text-muted))]">
            {[stock.ticker, profile?.kind, profile?.sector, stock.isin].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-bold tabular text-[rgb(var(--text-primary))]">{formatEuroPrecise(stock.currentPrice)}</p>
          {live && market?.changePct != null ? (
            <p className={`text-sm font-semibold tabular ${tone(market.changePct)}`}>
              {formatPercent(market.changePct)} <span className="font-normal text-[rgb(var(--text-muted))]">vandaag</span>
            </p>
          ) : (
            <p className="text-xs text-[rgb(var(--text-muted))]">{live ? 'Huidige koers' : 'Laatste transactieprijs'}</p>
          )}
        </div>
      </header>

      {!live && market !== undefined && (
        <p className="flex items-start gap-1.5 rounded-lg border border-[rgb(var(--banner-border))] bg-[rgb(var(--banner-bg))] px-3 py-2 text-xs text-[rgb(var(--banner-text))]">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          Er is voor dit aandeel geen live koers. De waarde is berekend met je laatste transactieprijs.
        </p>
      )}

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-3 space-y-5">
          <Card title="Jouw koersmomenten" subtitle="De koers op de dagen dat je kocht of verkocht, en de koers van nu">
            <PriceChart stock={stock} transactions={transactions} avgBuyPrice={held ? p.avgBuyPrice : 0} />
          </Card>

          <Card title="Jouw transacties">
            <ul className="divide-y divide-[rgb(var(--border))]">
              {txs.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[rgb(var(--text-primary))] tabular">{formatDate(t.date)}</p>
                    <p className="text-xs text-[rgb(var(--text-muted))] tabular">
                      <Private>{t.quantity}</Private> × {formatEuroPrecise(t.price)}
                    </p>
                  </div>
                  <div className="text-right">
                    <TransactionBadge type={t.type} />
                    <p className="text-xs text-[rgb(var(--text-secondary))] mt-1 tabular">
                      <Private>{formatEuroPrecise(t.quantity * t.price)}</Private>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Card title="Jouw positie">
            <dl>
              <Fact label="Aantal">
                <Private>{p.sharesHeld}</Private>
              </Fact>
              <Fact label="Waarde nu">
                <Private>{formatEuro(p.currentValue)}</Private>
              </Fact>
              {held && p.avgBuyPrice > 0 && <Fact label="Gem. aankoopkoers">{formatEuroPrecise(p.avgBuyPrice)}</Fact>}
              {held && p.invested > 0 && (
                <Fact label="Resultaat">
                  <span className={tone(p.profitLoss)}>
                    <Private>{formatEuro(p.profitLoss)}</Private> ({formatPercent(p.profitLossPct)})
                  </span>
                </Fact>
              )}
              {held && <Fact label="Deel van portefeuille">{formatPercentPlain(p.allocation, 1)}</Fact>}
              {Math.abs(p.realized) > 0.005 && (
                <Fact label="Verdiend met verkopen">
                  <span className={tone(p.realized)}>
                    <Private>{formatEuro(p.realized)}</Private>
                  </span>
                </Fact>
              )}
            </dl>
            {!held && <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">Je hebt dit aandeel niet meer in bezit.</p>}
          </Card>

          {live && market?.range52 && (
            <Card title="Koers in het afgelopen jaar" subtitle="Laagste tot hoogste koers van 52 weken">
              <RangeBar low={market.range52.low} high={market.range52.high} price={stock.currentPrice} />
            </Card>
          )}

          <Card title={`Over ${stock.name}`}>
            {profile ? (
              <p className="text-sm leading-relaxed text-[rgb(var(--text-secondary))] mb-3 max-w-prose">{profile.about}</p>
            ) : (
              <p className="text-sm text-[rgb(var(--text-muted))] mb-3">Voor dit aandeel is nog geen uitleg toegevoegd.</p>
            )}
            <dl>
              {profile && <Fact label="Soort">{profile.kind}</Fact>}
              {profile?.sector && <Fact label="Sector">{profile.sector}</Fact>}
              {profile?.country && <Fact label="Land">{profile.country}</Fact>}
              {market?.exchange && <Fact label="Beurs">{market.exchange}</Fact>}
              {market?.currency && <Fact label="Noteert in">{market.currency === 'GBp' ? 'Britse ponden (pence)' : market.currency}</Fact>}
              {stock.isin && <Fact label="ISIN">{stock.isin}</Fact>}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
};
