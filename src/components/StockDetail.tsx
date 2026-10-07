import React from 'react';
import { ArrowLeft, ExternalLink, Info } from 'lucide-react';
import { MarketInfo, StockPosition, Transaction } from '../data/types.ts';
import { findProfile } from '../data/stockProfiles.ts';
import { OTHER_COLOR } from '../utils/colors.ts';
import { formatDate, formatEuro, formatEuroPrecise, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { Fundamentals, useStockData } from '../hooks/useStockData.ts';
import { Card } from './Card.tsx';
import { PriceChart } from './PriceChart.tsx';
import { PriceHistoryChart } from './PriceHistoryChart.tsx';
import { TransactionBadge } from './TransactionBadge.tsx';

const SOURCE_NAME: Record<string, string> = {
  twelvedata: 'Twelve Data',
  justetf: 'justETF',
  finnhub: 'Finnhub',
  yahoo: 'Yahoo Finance',
  transactieprijs: 'Laatste transactieprijs',
};

interface StockDetailProps {
  position: StockPosition;
  transactions: Transaction[];
  market: MarketInfo | undefined;
  color?: string;
  /** Demo-versie: geen echte koershistorie of kerncijfers, wel het geschatte verloop. */
  isDemo?: boolean;
  onBack: () => void;
}

const tone = (v: number) => (v >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]');

const compactEuro = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(v);
const decimal = (v: number, digits = 1) =>
  new Intl.NumberFormat('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[rgb(var(--border))] last:border-0">
    <dt className="text-sm text-[rgb(var(--text-secondary))]">{label}</dt>
    <dd className="text-sm font-semibold text-[rgb(var(--text-primary))] text-right tabular">{children}</dd>
  </div>
);

/** Grote cijfertegel bovenaan de pagina. */
const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; valueClass?: string }> = ({
  label,
  value,
  sub,
  valueClass = 'text-[rgb(var(--text-primary))]',
}) => (
  <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] min-w-0">
    <p className="text-xs font-medium text-[rgb(var(--text-muted))]">{label}</p>
    <p className={`mt-1 text-xl sm:text-2xl font-bold tracking-tight tabular truncate ${valueClass}`}>{value}</p>
    {sub && <p className="mt-0.5 text-xs text-[rgb(var(--text-muted))] tabular truncate">{sub}</p>}
  </div>
);

/** Klein cijfer met label, voor de kerncijfers. */
const Metric: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="min-w-0" title={hint}>
    <dt className="text-xs text-[rgb(var(--text-muted))]">{label}</dt>
    <dd className="mt-0.5 text-sm font-semibold text-[rgb(var(--text-primary))] tabular">{value}</dd>
  </div>
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-sunken))] px-2.5 py-0.5 text-xs font-medium text-[rgb(var(--text-secondary))]">
    {children}
  </span>
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

const FundamentalsGrid: React.FC<{ f: Fundamentals }> = ({ f }) => {
  const items: { label: string; value: string; hint: string }[] = [];
  const add = (label: string, v: number | null | undefined, fmt: (n: number) => string, hint: string) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) items.push({ label, value: fmt(v), hint });
  };
  add('Marktwaarde', f.marketCapEur, compactEuro, 'Wat alle aandelen van het bedrijf samen waard zijn op de beurs.');
  add('Koers/winst', f.pe, (n) => decimal(n, 1), 'Wat je betaalt voor 1 euro winst per jaar. Lager is goedkoper, maar zegt niet alles.');
  add('Dividendrendement', f.dividendYield, (n) => formatPercentPlain(n, 1), 'Het dividend per jaar als deel van de koers.');
  add('Bèta', f.beta, (n) => decimal(n, 2), 'Hoe sterk het aandeel meebeweegt met de hele markt. 1 = gelijk, hoger = schommelt meer.');
  add('Omzetgroei', f.revenueGrowth, (n) => formatPercent(n), 'Groei van de omzet ten opzichte van een jaar eerder.');
  add('Brutomarge', f.grossMargin, (n) => formatPercentPlain(n, 0), 'Van elke euro omzet blijft zoveel over na de directe kosten.');
  add('Nettomarge', f.netMargin, (n) => formatPercentPlain(n, 1), 'Van elke euro omzet blijft zoveel winst over.');
  add('Rendement eigen vermogen', f.roe, (n) => formatPercentPlain(n, 0), 'Hoeveel winst het bedrijf maakt over het geld van de aandeelhouders.');
  add('Koers/boekwaarde', f.pb, (n) => decimal(n, 1), 'De koers vergeleken met wat het bedrijf op papier waard is.');
  if (f.ipo) items.push({ label: 'Op de beurs sinds', value: formatDate(f.ipo), hint: 'Datum van de beursgang.' });
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
      {items.map((i) => (
        <Metric key={i.label} label={i.label} value={i.value} hint={i.hint} />
      ))}
    </dl>
  );
};

/** Het overzicht van één aandeel: wat het is, hoe het ervoor staat en wat jij ermee deed. */
export const StockDetail: React.FC<StockDetailProps> = ({ position: p, transactions, market, color: stockColor, isDemo = false, onBack }) => {
  const { stock } = p;
  const profile = findProfile(stock);
  const txs = transactions.filter((t) => t.ticker === stock.ticker).sort((a, b) => b.date.localeCompare(a.date));
  const held = p.sharesHeld > 0;
  const live = market?.live === true;
  const color = stockColor ?? OTHER_COLOR;
  const { history, fundamentals } = useStockData(stock.ticker, !isDemo);

  const divs = market?.dividends;
  const dividend =
    live && divs && divs.length > 0
      ? { perShare: divs.reduce((s, d) => s + d.amount, 0), count: divs.length, last: divs[divs.length - 1].date }
      : null;
  const hasFundamentals = fundamentals?.available === true;
  const showKeyFigures = hasFundamentals || (profile?.facts && profile.facts.length > 0) || (live && market?.range52);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="no-print inline-flex items-center gap-1.5 -ml-1 px-2 py-1.5 rounded-lg text-sm font-medium text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Terug naar overzicht
      </button>

      {/* Kop: naam, soort, koers */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-l-4 pl-4" style={{ borderColor: color }}>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[rgb(var(--text-primary))]">{stock.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{stock.ticker}</Chip>
            {profile?.kind && <Chip>{profile.kind}</Chip>}
            {(profile?.sector ?? (hasFundamentals ? fundamentals?.industry : null)) && (
              <Chip>{profile?.sector ?? fundamentals?.industry}</Chip>
            )}
            {(profile?.country ?? (hasFundamentals ? fundamentals?.country : null)) && <Chip>{profile?.country ?? fundamentals?.country}</Chip>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-bold tabular text-[rgb(var(--text-primary))]">{formatEuroPrecise(stock.currentPrice)}</p>
          {live && market?.changePct != null ? (
            <p className={`text-sm font-semibold tabular ${tone(market.changePct)}`}>
              {formatPercent(market.changePct)} <span className="font-normal text-[rgb(var(--text-muted))]">laatste dag</span>
            </p>
          ) : (
            <p className="text-xs text-[rgb(var(--text-muted))]">{live ? 'Laatste koers' : 'Laatste transactieprijs'}</p>
          )}
        </div>
      </header>

      {!live && market !== undefined && (
        <p className="flex items-start gap-1.5 rounded-lg border border-[rgb(var(--banner-border))] bg-[rgb(var(--banner-bg))] px-3 py-2 text-xs text-[rgb(var(--banner-text))]">
          <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          Er is voor dit aandeel geen koers binnen. De waarde is berekend met je laatste transactieprijs.
        </p>
      )}

      {/* Jouw cijfers in vier tegels */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {held ? (
          <>
            <Tile label="Waarde nu" value={<Private>{formatEuro(p.currentValue)}</Private>} sub={<><Private>{p.sharesHeld}</Private> stuks</>} />
            {p.invested > 0 ? (
              <Tile
                label="Resultaat"
                value={<Private>{formatEuro(p.profitLoss)}</Private>}
                sub={formatPercent(p.profitLossPct)}
                valueClass={tone(p.profitLoss)}
              />
            ) : (
              <Tile label="Resultaat" value="–" sub="Geen aankoopprijs bekend" />
            )}
            <Tile label="Deel van portefeuille" value={formatPercentPlain(p.allocation, 1)} />
            <Tile label="Gem. aankoopkoers" value={p.avgBuyPrice > 0 ? formatEuroPrecise(p.avgBuyPrice) : '–'} sub={`Nu ${formatEuroPrecise(stock.currentPrice)}`} />
          </>
        ) : (
          <>
            <Tile label="Status" value="Verkocht" sub="Niet meer in bezit" />
            <Tile
              label="Verdiend met verkopen"
              value={<Private>{formatEuro(p.realized)}</Private>}
              valueClass={tone(p.realized)}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-3 min-w-0 space-y-5">
          {isDemo || history.status === 'error' ? (
            <Card
              title="Jouw koersmomenten"
              subtitle={
                isDemo
                  ? 'De koers op de dagen dat je kocht of verkocht, en de koers van nu'
                  : 'Echte koershistorie is niet beschikbaar. Dit zijn de koersen op jouw koop- en verkoopdagen.'
              }
            >
              <PriceChart stock={stock} transactions={transactions} avgBuyPrice={held ? p.avgBuyPrice : 0} />
            </Card>
          ) : (
            <Card title="Koers" subtitle="Dagkoersen in euro's">
              {history.status === 'loading' ? (
                <div className="h-[280px] rounded-xl bg-[rgb(var(--surface-sunken))] animate-pulse" aria-label="Koershistorie wordt geladen" />
              ) : (
                <PriceHistoryChart points={history.points} transactions={txs} avgBuyPrice={held ? p.avgBuyPrice : 0} />
              )}
            </Card>
          )}

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

        <div className="lg:col-span-2 min-w-0 space-y-5">
          {(profile || market?.exchange || market?.currency || stock.isin) && (
            <Card title={`Over ${stock.name}`}>
              {profile && <p className="text-sm leading-relaxed text-[rgb(var(--text-secondary))] mb-3 max-w-prose">{profile.about}</p>}
              <dl>
                {profile && <Fact label="Soort">{profile.kind}</Fact>}
                {market?.exchange && <Fact label="Beurs">{market.exchange}</Fact>}
                {market?.currency && <Fact label="Noteert in">{market.currency === 'GBp' ? 'Britse ponden (pence)' : market.currency}</Fact>}
                {live && market?.source && <Fact label="Koersbron">{SOURCE_NAME[market.source] ?? market.source}</Fact>}
                {stock.isin && <Fact label="ISIN">{stock.isin}</Fact>}
              </dl>
              {hasFundamentals && fundamentals?.website && (
                <a
                  href={fundamentals.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-print mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[rgb(var(--accent-text))] hover:underline"
                >
                  Website van het bedrijf <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </Card>
          )}

          {showKeyFigures && (
            <Card title="Kerncijfers" subtitle={hasFundamentals ? 'Over de afgelopen 12 maanden, zoals gemeld door het bedrijf' : undefined}>
              {live && market?.range52 && (
                <div className="mb-5">
                  <p className="text-xs font-medium text-[rgb(var(--text-muted))] mb-2">Koers in het afgelopen jaar</p>
                  <RangeBar low={market.range52.low} high={market.range52.high} price={stock.currentPrice} />
                </div>
              )}
              {hasFundamentals && fundamentals && <FundamentalsGrid f={fundamentals} />}
              {!hasFundamentals && profile?.facts && (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {profile.facts.map((f) => (
                      <Metric key={f.label} label={f.label} value={f.value} />
                    ))}
                  </dl>
                  <p className="mt-4 text-xs text-[rgb(var(--text-muted))]">
                    Afgeronde cijfers van de fondsaanbieder. Ze kunnen veranderen, kijk voor de actuele waarden in het factsheet.
                  </p>
                </>
              )}
              {hasFundamentals && (
                <details className="mt-4 text-xs text-[rgb(var(--text-muted))]">
                  <summary className="cursor-pointer font-semibold text-[rgb(var(--text-secondary))]">Wat betekenen deze cijfers?</summary>
                  <ul className="mt-2 space-y-1.5 leading-relaxed">
                    <li><strong>Koers/winst:</strong> wat je betaalt voor 1 euro winst per jaar.</li>
                    <li><strong>Bèta:</strong> hoe sterk het aandeel meebeweegt met de markt (1 = gelijk).</li>
                    <li><strong>Marges:</strong> hoeveel van elke euro omzet overblijft als winst.</li>
                    <li><strong>Rendement eigen vermogen:</strong> winst over het geld van de aandeelhouders.</li>
                  </ul>
                </details>
              )}
            </Card>
          )}

          {dividend && (
            <Card title="Dividend" subtitle="Wat dit aandeel het afgelopen jaar uitkeerde">
              <dl>
                <Fact label="Per aandeel">{formatEuroPrecise(dividend.perShare)}</Fact>
                <Fact label="Aantal uitkeringen">{dividend.count}</Fact>
                <Fact label="Laatste uitkering">{formatDate(dividend.last)}</Fact>
                {held && (
                  <Fact label="Verwacht voor jou">
                    <Private>{formatEuroPrecise(dividend.perShare * p.sharesHeld)}</Private>
                  </Fact>
                )}
              </dl>
              <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">Bruto en een schatting, gebaseerd op het afgelopen jaar.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
