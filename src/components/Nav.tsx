import React from 'react';
import { LayoutDashboard, ArrowLeftRight, Activity, Info, LogOut, Sun, Moon, Eye, EyeOff, LineChart } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { Page } from '../hooks/useHashRoute.ts';
import { DemoReason } from '../hooks/usePortfolioData.ts';

export type { Page };

interface NavProps {
  page: Page;
  onNavigate: (page: Page) => void;
  isDemo: boolean;
  demoReason: DemoReason;
}

const iconBtn =
  'inline-flex items-center justify-center gap-1.5 min-w-[44px] sm:min-w-0 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors';

export const Nav: React.FC<NavProps> = ({ page, onNavigate, isDemo, demoReason }) => {
  const { dark, toggle: toggleTheme } = useTheme();
  const { hidden, toggle: togglePrivacy } = usePrivacy();

  const items: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'overzicht', label: 'Overzicht', icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> },
    { id: 'transacties', label: 'Transacties', icon: <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> },
    // Alleen in de demo-versie.
    ...(isDemo ? [{ id: 'koersen' as Page, label: 'Koersen', icon: <Activity className="w-4 h-4" aria-hidden="true" /> }] : []),
  ];

  return (
    <header className="sticky top-0 z-20 bg-[rgb(var(--surface))]/90 backdrop-blur-md border-b border-[rgb(var(--border))]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('overzicht')}
          className="flex items-center gap-2 font-bold text-[rgb(var(--text-primary))]"
          aria-label="Naar het overzicht"
        >
          <span className="w-7 h-7 rounded-lg bg-[rgb(var(--series-1))] text-white flex items-center justify-center" aria-hidden="true">
            <LineChart className="w-4 h-4" />
          </span>
          <span className="hidden min-[420px]:inline">Beleggingen</span>
        </button>

        <nav className="flex items-center gap-1" aria-label="Hoofdnavigatie">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
              className={`${iconBtn} text-sm ${
                page === item.id
                  ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]'
                  : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
              }`}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={togglePrivacy}
            aria-pressed={hidden}
            className={`${iconBtn} ${
              hidden
                ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]'
                : 'text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))]'
            }`}
            title={hidden ? 'Anonieme modus staat aan. Klik om bedragen weer te tonen.' : 'Anonieme modus: verberg aantallen en bedragen'}
          >
            {hidden ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            <span className="hidden md:inline">Anoniem</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className={`${iconBtn} text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))]`}
            title={dark ? 'Schakel naar licht' : 'Schakel naar donker'}
            aria-label={dark ? 'Schakel naar licht thema' : 'Schakel naar donker thema'}
          >
            {dark ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              fetch('/api/logout', { method: 'POST' }).finally(() => location.reload());
            }}
            className={`${iconBtn} text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))]`}
            title="Uitloggen"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            <span className="hidden lg:inline">Uitloggen</span>
          </button>
        </div>
      </div>

      {(isDemo || hidden) && (
        <div className="bg-[rgb(var(--banner-bg))] border-t border-[rgb(var(--banner-border))]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-[rgb(var(--banner-text))]">
            {isDemo && (
              <span className="flex items-center gap-1.5">
                <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
                {demoReason === 'account'
                  ? 'Demo-account: voorbeeldgegevens, geen echte portefeuille.'
                  : 'Demodata: nog geen echte transacties binnengekomen via Gmail/n8n.'}
              </span>
            )}
            {hidden && (
              <span className="flex items-center gap-1.5">
                <EyeOff className="w-3 h-3 shrink-0" aria-hidden="true" />
                Anonieme modus: aantallen en bedragen zijn verborgen.
              </span>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
