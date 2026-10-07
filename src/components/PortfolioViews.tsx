import React, { useState } from 'react';
import { SeriesPoint, StockPosition } from '../data/types.ts';
import { PortfolioTotals } from '../utils/portfolio.ts';
import { Card } from './Card.tsx';
import { DonutChart } from './DonutChart.tsx';
import { ReturnBars } from './ReturnBars.tsx';
import { Treemap } from './Treemap.tsx';
import { PortfolioChart } from './PortfolioChart.tsx';

type View = 'cirkel' | 'rendement' | 'blokken' | 'verloop';

const VIEWS: { id: View; label: string; subtitle: string }[] = [
  { id: 'cirkel', label: 'Verdeling', subtitle: 'Je vijf grootste posities in kleur, de rest samen als Overig.' },
  { id: 'rendement', label: 'Rendement', subtitle: 'Winst of verlies per aandeel sinds aankoop, van best naar slechtst.' },
  { id: 'blokken', label: 'Blokken', subtitle: 'Hoe groter het blok, hoe groter je positie. De kleur toont je rendement.' },
  { id: 'verloop', label: 'Verloop', subtitle: 'Wat je portefeuille waard is ten opzichte van wat je hebt ingelegd (geschat). Beweeg over de grafiek.' },
];
const STORAGE_KEY = 'beleggingen_view';

function readView(): View {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (VIEWS.some((x) => x.id === v)) return v as View;
  } catch {
    /* negeren */
  }
  return 'cirkel';
}

interface PortfolioViewsProps {
  positions: StockPosition[];
  totals: PortfolioTotals;
  showInvested: boolean;
  series: SeriesPoint[];
  colors: Record<string, string>;
  onSelectStock: (ticker: string) => void;
}

/** Eén kaart, vier manieren om naar je portefeuille te kijken. Je keuze wordt onthouden. */
export const PortfolioViews: React.FC<PortfolioViewsProps> = ({ positions, totals, showInvested, series, colors, onSelectStock }) => {
  const [view, setView] = useState<View>(readView);
  const current = VIEWS.find((v) => v.id === view)!;

  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* negeren */
    }
  };

  const tabs = (
    <div role="tablist" aria-label="Weergave" className="no-print inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] max-w-full overflow-x-auto">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          onClick={() => choose(v.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
            view === v.id
              ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm'
              : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))]'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <Card title="Mijn portefeuille" subtitle={current.subtitle}>
      <div className="mb-5">{tabs}</div>
      {view === 'cirkel' && <DonutChart positions={positions} colors={colors} totals={totals} showInvested={showInvested} onSelect={onSelectStock} />}
      {view === 'rendement' && <ReturnBars positions={positions} onSelect={onSelectStock} />}
      {view === 'blokken' && <Treemap positions={positions} onSelect={onSelectStock} />}
      {view === 'verloop' && <PortfolioChart series={series} />}
    </Card>
  );
};
