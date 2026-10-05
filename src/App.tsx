import React, { useMemo, useState } from 'react';
import { Nav, Page } from './components/Nav.tsx';
import { KpiRow } from './components/KpiRow.tsx';
import { AllocationBar } from './components/AllocationBar.tsx';
import { ValueChart } from './components/ValueChart.tsx';
import { RecentTransactions } from './components/RecentTransactions.tsx';
import { TransactionsTable } from './components/TransactionsTable.tsx';
import { usePortfolioData } from './hooks/usePortfolioData.ts';
import { computePositions, computeTotals, computeValueOverTime } from './utils/portfolio.ts';

const Card: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="rounded-2xl bg-white border border-[rgb(var(--border))] p-4 sm:p-5 shadow-sm">
    <div className="mb-4">
      <h2 className="text-sm font-bold text-[rgb(var(--text-primary))]">{title}</h2>
      {subtitle && <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </section>
);

export default function App() {
  const [page, setPage] = useState<Page>('overzicht');
  const { stocks, transactions, isDemo, demoReason, loading } = usePortfolioData();

  const positions = useMemo(() => computePositions(stocks, transactions), [stocks, transactions]);
  const totals = useMemo(() => computeTotals(positions), [positions]);
  const valuePoints = useMemo(() => computeValueOverTime(stocks, transactions), [stocks, transactions]);

  // Ingelegd bedrag alleen tonen als elke positie een betrouwbare kostenbasis heeft.
  const showInvested = positions.every((p) => p.invested > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[rgb(var(--text-muted))]">
        Laden…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav page={page} onNavigate={setPage} isDemo={isDemo} demoReason={demoReason} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {page === 'overzicht' ? (
          <>
            <KpiRow totals={totals} showInvested={showInvested} />

            <Card title="Verdeling per aandeel" subtitle="Waar je geld op dit moment in zit">
              <AllocationBar positions={positions} />
            </Card>

            <Card title="Waarde door de tijd" subtitle="Geschat verloop op basis van je transacties">
              <ValueChart points={valuePoints} />
            </Card>

            <Card title="Laatste transacties">
              <RecentTransactions transactions={transactions} limit={5} />
              <button
                type="button"
                onClick={() => setPage('transacties')}
                className="mt-3 text-sm font-semibold text-[rgb(var(--series-1))] hover:underline"
              >
                Alle transacties bekijken →
              </button>
            </Card>
          </>
        ) : (
          <Card title="Transacties" subtitle={`${transactions.length} transacties in totaal`}>
            <TransactionsTable transactions={transactions} stocks={stocks} />
          </Card>
        )}
      </main>

      <footer className="border-t border-[rgb(var(--border))] py-5 text-center text-xs text-[rgb(var(--text-muted))]">
        Beleggingen — persoonlijk overzicht{isDemo ? ' (demodata)' : ''}
      </footer>
    </div>
  );
}
