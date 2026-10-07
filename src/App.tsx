import React, { useMemo } from 'react';
import { Nav } from './components/Nav.tsx';
import { Card } from './components/Card.tsx';
import { KpiRow } from './components/KpiRow.tsx';
import { QuoteNote } from './components/QuoteNote.tsx';
import { PortfolioViews } from './components/PortfolioViews.tsx';
import { StockList } from './components/StockList.tsx';
import { StockDetail } from './components/StockDetail.tsx';
import { RecentTransactions } from './components/RecentTransactions.tsx';
import { TransactionsTable } from './components/TransactionsTable.tsx';
import { QuoteFlow, QuoteSourcesTable } from './components/QuoteSources.tsx';
import { DEMO_QUOTES } from './data/demoData.ts';
import { usePortfolioData } from './hooks/usePortfolioData.ts';
import { useHashRoute } from './hooks/useHashRoute.ts';
import { computeAllPositions, computeSeries, computeTotals } from './utils/portfolio.ts';
import { assignColors } from './utils/colors.ts';
import { DividendCard } from './components/DividendCard.tsx';
import { EtfSplitCard } from './components/EtfSplitCard.tsx';
import { ExportBar } from './components/ExportBar.tsx';
import { exportPositionsCsv, exportTransactionsCsv } from './utils/exportData.ts';

export default function App() {
  const { route, goPage, goStock } = useHashRoute();
  const { stocks, transactions, isDemo, demoReason, loading, quoteStatus, market } = usePortfolioData();

  // De Koersen-pagina bestaat alleen in de demo-versie.
  const page = route.page === 'koersen' && !isDemo ? 'overzicht' : route.page;

  const allPositions = useMemo(() => computeAllPositions(stocks, transactions), [stocks, transactions]);
  const positions = useMemo(
    () => allPositions.filter((p) => p.sharesHeld > 0).sort((a, b) => b.currentValue - a.currentValue),
    [allPositions]
  );
  const totals = useMemo(() => computeTotals(positions), [positions]);
  const colors = useMemo(() => assignColors(positions), [positions]);

  // Verandering van vandaag: alleen tonen als voor het grootste deel van je geld een live dagverandering bekend is.
  const today = useMemo(() => {
    let covered = 0;
    let before = 0;
    let now = 0;
    for (const p of positions) {
      const pct = market[p.stock.ticker]?.changePct;
      if (market[p.stock.ticker]?.live && pct != null && pct > -0.99) {
        covered += p.currentValue;
        now += p.currentValue;
        before += p.currentValue / (1 + pct);
      }
    }
    const total = positions.reduce((s, p) => s + p.currentValue, 0);
    if (total <= 0 || covered / total < 0.8 || before <= 0) return null;
    return { amount: now - before, pct: now / before - 1 };
  }, [positions, market]);
  const series = useMemo(() => computeSeries(stocks, transactions), [stocks, transactions]);

  // Ingelegd bedrag alleen tonen als elke positie een betrouwbare kostenbasis heeft.
  const showInvested = positions.every((p) => p.invested > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[rgb(var(--text-muted))]">Laden…</div>
    );
  }

  const detail = route.ticker ? allPositions.find((p) => p.stock.ticker === route.ticker) : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <Nav page={page} onNavigate={goPage} isDemo={isDemo} demoReason={demoReason} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {detail ? (
          <StockDetail
            position={detail}
            transactions={transactions}
            market={market[detail.stock.ticker]}
            color={colors[detail.stock.ticker]}
            onBack={() => goPage('overzicht')}
          />
        ) : page === 'koersen' ? (
          <>
            <Card title="Zo komen de koersen binnen" subtitle="Voorbeeld in de demo. In de echte versie komt dit uit /api/quotes.">
              <QuoteFlow />
            </Card>
            <Card title="Koersen per aandeel" subtitle="Demodata: vier situaties die kunnen voorkomen">
              <QuoteSourcesTable stocks={stocks} quotes={DEMO_QUOTES} />
            </Card>
          </>
        ) : page === 'overzicht' ? (
          <>
            <KpiRow totals={totals} positions={positions} showInvested={showInvested} today={today} onSelectStock={goStock} />
            {!isDemo && <QuoteNote status={quoteStatus} />}

            <PortfolioViews
              positions={positions}
              totals={totals}
              showInvested={showInvested}
              series={series}
              colors={colors}
              onSelectStock={goStock}
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
              <Card title="Mijn aandelen" subtitle="Klik op een aandeel voor het overzicht" className="lg:col-span-3 min-w-0">
                <StockList positions={positions} market={market} colors={colors} onSelect={goStock} />
              </Card>

              <Card title="Laatste transacties" className="lg:col-span-2 min-w-0">
                <RecentTransactions transactions={transactions} limit={5} onSelectStock={goStock} />
                <button
                  type="button"
                  onClick={() => goPage('transacties')}
                  className="mt-3 text-sm font-semibold text-[rgb(var(--accent-text))] hover:underline"
                >
                  Alle transacties bekijken →
                </button>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <EtfSplitCard positions={positions} onSelectStock={goStock} />
              <DividendCard
                positions={positions}
                transactions={transactions}
                market={market}
                colors={colors}
                onSelectStock={goStock}
              />
            </div>

            <ExportBar csvLabel="Posities (CSV)" onCsv={() => exportPositionsCsv(positions)} />
          </>
        ) : (
          <Card
            title="Transacties"
            subtitle={`${transactions.length} transacties in totaal`}
            action={<ExportBar csvLabel="Transacties (CSV)" onCsv={() => exportTransactionsCsv(transactions, stocks)} />}
          >
            <TransactionsTable transactions={transactions} stocks={stocks} onSelectStock={goStock} />
          </Card>
        )}
      </main>

      <footer className="border-t border-[rgb(var(--border))] py-5 text-center text-xs text-[rgb(var(--text-muted))]">
        Beleggingen · persoonlijk overzicht{isDemo ? ' (demodata)' : ''} · geen beleggingsadvies
      </footer>
    </div>
  );
}
