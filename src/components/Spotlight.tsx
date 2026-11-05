import React from 'react';
import { Sparkles, Flag, Microscope, ChevronRight } from 'lucide-react';
import { Page } from '../hooks/useHashRoute.ts';

interface Props {
  onNavigate: (p: Page) => void;
  score: number | null;
  scoreLabel: string | null;
  race: { label: string; diff: number } | null;
}

/** Drie snelkoppelingen bovenaan het overzicht, zodat de nieuwe onderdelen niet verstopt zitten. */
export const Spotlight: React.FC<Props> = ({ onNavigate, score, scoreLabel, race }) => (
  <div className="no-print grid gap-3 sm:grid-cols-3">
    <button
      type="button"
      onClick={() => onNavigate('wrapped')}
      className="group text-left rounded-2xl p-4 text-white bg-gradient-to-br from-[#312e81] via-[#7c3aed] to-[#db2777] relative overflow-hidden"
    >
      <span className="absolute -right-3 -top-3 text-6xl opacity-20 group-hover:scale-110 transition-transform" aria-hidden="true">
        ✨
      </span>
      <p className="text-xs font-semibold text-white/75 flex items-center gap-1">
        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Nieuw
      </p>
      <p className="font-extrabold text-lg mt-1">Jouw beleggings-Wrapped</p>
      <p className="text-xs text-white/80 mt-0.5 flex items-center gap-0.5">
        Bekijk je jaar als story <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
      </p>
    </button>
    <button
      type="button"
      onClick={() => onNavigate('race')}
      className="group text-left rounded-2xl p-4 border border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--border-strong))] transition-colors"
    >
      <p className="text-xs font-semibold text-[rgb(var(--text-muted))] flex items-center gap-1">
        <Flag className="w-3.5 h-3.5" aria-hidden="true" /> Race tegen de markt
      </p>
      {race ? (
        <>
          <p className={`font-extrabold text-lg mt-1 ${race.diff >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
            {race.diff >= 0 ? 'Je verslaat' : 'Je loopt achter op'} de {race.label}
          </p>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">
            {race.diff >= 0 ? '+' : '−'}
            {Math.abs(Math.round(race.diff * 1000) / 10).toLocaleString('nl-NL')} procentpunt · bekijk de race →
          </p>
        </>
      ) : (
        <>
          <p className="font-extrabold text-lg mt-1 text-[rgb(var(--text-primary))]">Jij vs S&P 500</p>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">Koersen laden…</p>
        </>
      )}
    </button>
    <button
      type="button"
      onClick={() => onNavigate('inzicht')}
      className="group text-left rounded-2xl p-4 border border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--border-strong))] transition-colors"
    >
      <p className="text-xs font-semibold text-[rgb(var(--text-muted))] flex items-center gap-1">
        <Microscope className="w-3.5 h-3.5" aria-hidden="true" /> Portefeuillescore
      </p>
      {score !== null ? (
        <>
          <p className="font-extrabold text-lg mt-1 text-[rgb(var(--text-primary))]">
            <span className="tabular">{score}</span>
            <span className="text-[rgb(var(--text-muted))] text-sm font-semibold">/100</span> · {scoreLabel}
          </p>
          <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">Plus duels en 3 ideeën →</p>
        </>
      ) : (
        <p className="font-extrabold text-lg mt-1">Bekijk je analyse</p>
      )}
    </button>
  </div>
);
