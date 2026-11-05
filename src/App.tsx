import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Page, useHashRoute } from './hooks/useHashRoute.ts';
import { computeAllPositions, computeSeries, computeTotals } from './utils/portfolio.ts';
import { assignColors } from './utils/colors.ts';
import { DividendCard } from './components/DividendCard.tsx';
import { EtfSplitCard } from './components/EtfSplitCard.tsx';
import { ExportBar } from './components/ExportBar.tsx';
import { exportPositionsCsv, exportTransactionsCsv } from './utils/exportData.ts';
import { StudyLoanPage } from './components/StudyLoanPage.tsx';
import { WeeklyReportPage } from './components/WeeklyReportPage.tsx';
import { useHistories } from './hooks/useHistories.ts';
import { annualVolatility, cashflowReturn, computeRealSeries, simulateSameCashflows, timeWeightedIndex } from './utils/history.ts';
import { InsightsPage } from './components/InsightsPage.tsx';
import { RacePage } from './components/RacePage.tsx';
import { FuturePage } from './components/FuturePage.tsx';
import { ChatPage, CHAT_PREFILL_KEY, CHAT_ASK_EVENT } from './components/ChatPage.tsx';
import { WrappedStory } from './components/WrappedStory.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { Spotlight } from './components/Spotlight.tsx';
import { computeExposure, healthScore } from './utils/analysis.ts';

export default function App() {
  const { route, goPage, goStock } = useHashRoute();
  const { stocks, transactions, isDemo, demoReason, loading, quoteStatus, market, refreshing, refreshQuotes } = usePortfolioData();
  const [searchOpen, setSearchOpen] = useState(false);

  // De Koersen-pagina bestaat alleen in de demo-versie.
  const page = route.page === 'koersen' && !isDemo ? 'overzicht' : route.page;
  const showWrapped = page === 'wrapped';
  // Achter Wrapped laten we het overzicht zien.
  const basePage: Page = showWrapped ? 'overzicht' : page;

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

  // Echte koershistorie (en de indexen). Begint pas als de pagina staat, zodat het overzicht snel verschijnt.
  const hist = useHistories(transactions, isDemo, !loading);
  const estimated = useMemo(() => computeSeries(stocks, transactions), [stocks, transactions]);
  const real = useMemo(
    () => (Object.keys(hist.histories).length > 0 ? computeRealSeries(stocks, transactions, hist.histories) : null),
    [stocks, transactions, hist.histories]
  );
  const series = real && real.series.length > 2 ? real.series : estimated;
  const myVolatility = useMemo(() => {
    if (!real || real.series.length < 30) return null;
    const days = real.series.map((p) => p.date);
    return annualVolatility(timeWeightedIndex(real.series.map((p) => p.total), days, transactions), days);
  }, [real, transactions]);

  const health = useMemo(() => (positions.length ? healthScore(computeExposure(positions)) : null), [positions]);
  const raceTeaser = useMemo(() => {
    const sp = hist.benchmarks.sp500;
    if (!sp || !real || real.series.length < 3) return null;
    const alt = simulateSameCashflows(transactions, sp, real.series.map((p) => p.date));
    const mine = cashflowReturn(transactions, real.series[real.series.length - 1].total);
    const theirs = cashflowReturn(transactions, alt[alt.length - 1]);
    if (mine == null || theirs == null) return null;
    return { label: 'S&P 500', diff: mine - theirs };
  }, [hist.benchmarks, real, transactions]);

  // Ingelegd bedrag alleen tonen als elke positie een betrouwbare kostenbasis heeft.
  const showInvested = positions.every((p) => p.invested > 0);

  const askAi = useCallback(
    (q: string) => {
      try {
        sessionStorage.setItem(CHAT_PREFILL_KEY, q);
      } catch {
        /* negeren */
      }
      if (page === 'chat') window.dispatchEvent(new Event(CHAT_ASK_EVENT));
      else goPage('chat');
    },
    [goPage, page]
  );

  // ⌘K / Ctrl+K opent snel zoeken.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-[rgb(var(--text-muted))]">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2a78d6] to-[#8b5cf6] animate-pulse" aria-hidden="true" />
        Laden…
      </div>
    );
  }

  const detail = route.ticker ? allPositions.find((p) => p.stock.ticker === route.ticker) : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <Nav page={basePage} onNavigate={goPage} isDemo={isDemo} demoReason={demoReason} onOpenSearch={() => setSearchOpen(true)} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28 md:pb-8 space-y-5">
        {detail ? (
          <StockDetail
            position={detail}
            transactions={transactions}
            market={market[detail.stock.ticker]}
            color={colors[detail.stock.ticker]}
            isDemo={isDemo}
            onBack={() => goPage('overzicht')}
          />
        ) : basePage === 'koersen' ? (
          <>
            <Card title="Zo komen de koersen binnen" subtitle="Voorbeeld in de demo. In de echte versie komt dit uit /api/quotes.">
              <QuoteFlow />
            </Card>
            <Card title="Koersen per aandeel" subtitle="Demodata: de situaties die kunnen voorkomen">
              <QuoteSourcesTable stocks={stocks} quotes={DEMO_QUOTES} />
            </Card>
          </>
        ) : basePage === 'inzicht' ? (
          <InsightsPage
            positions={positions}
            transactions={transactions}
            histories={hist.histories}
            benchmarks={hist.benchmarks}
            isDemo={isDemo}
            onSelectStock={goStock}
            onAskAi={askAi}
          />
        ) : basePage === 'race' ? (
          <RacePage series={series} transactions={transactions} benchmarks={hist.benchmarks} loading={hist.status !== 'done'} isDemo={isDemo} />
        ) : basePage === 'toekomst' ? (
          <FuturePage currentValue={totals.totalValue} myVolatility={myVolatility} />
        ) : basePage === 'chat' ? (
          <ChatPage isDemo={isDemo} positions={positions} />
        ) : basePage === 'weekrapport' ? (
          <WeeklyReportPage isDemo={isDemo} onSelectStock={goStock} />
        ) : basePage === 'studieschuld' ? (
          <StudyLoanPage isDemo={isDemo} totals={totals} showInvested={showInvested} />
        ) : basePage === 'overzicht' ? (
          <>
            <KpiRow totals={totals} positions={positions} showInvested={showInvested} today={today} onSelectStock={goStock} />
            {!isDemo && <QuoteNote status={quoteStatus} refreshing={refreshing} onRefresh={refreshQuotes} />}

            <Spotlight onNavigate={goPage} score={health?.total ?? null} scoreLabel={health?.label ?? null} race={raceTeaser} />

            <PortfolioViews
              positions={positions}
              totals={totals}
              showInvested={showInvested}
              series={series}
              realCoverage={real ? real.coverage : null}
              isDemo={isDemo}
              colors={colors}
              onSelectStock={goStock}
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
              <Card title="Mijn aandelen" subtitle="Klik op een aandeel voor het overzicht" className="lg:col-span-3 min-w-0">
                <StockList positions={positions} market={market} colors={colors} onSelect={goStock} />
              </Card>

              <Card title="Laatste transacties" className="lg:col-span-2 min-w-0">
                <RecentTransactions transactions={transactions} stocks={stocks} limit={5} onSelectStock={goStock} />
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

      <footer className="hidden md:block border-t border-[rgb(var(--border))] py-5 text-center text-xs text-[rgb(var(--text-muted))]">
        Beleggingen · persoonlijk overzicht{isDemo ? ' (demodata)' : ''} · geen beleggingsadvies · <kbd className="font-sans">⌘K</kbd> om te zoeken
      </footer>

      {showWrapped && (
        <WrappedStory
          stocks={stocks}
          transactions={transactions}
          positions={positions}
          series={series}
          benchmarks={hist.benchmarks}
          onClose={() => goPage('overzicht')}
        />
      )}

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        positions={positions}
        isDemo={isDemo}
        onPage={goPage}
        onStock={goStock}
        onRefresh={refreshQuotes}
        onAsk={askAi}
      />
    </div>
  );
}
