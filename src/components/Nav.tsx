import React from 'react';
import { LayoutDashboard, ArrowLeftRight, Activity, Info, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.ts';
import { DemoReason } from '../hooks/usePortfolioData.ts';

export type Page = 'overzicht' | 'transacties' | 'koersen';

interface NavProps {
  page: Page;
  onNavigate: (page: Page) => void;
  isDemo: boolean;
  demoReason: DemoReason;
}

export const Nav: React.FC<NavProps> = ({ page, onNavigate, isDemo, demoReason }) => {
  const { preference, cycle } = useTheme();
  const themeLabel = { system: 'Thema: volgt apparaat', light: 'Thema: licht', dark: 'Thema: donker' }[preference];
  const ThemeIcon = preference === 'system' ? Monitor : preference === 'light' ? Sun : Moon;

  const items: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'overzicht', label: 'Overzicht', icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> },
    { id: 'transacties', label: 'Transacties', icon: <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> },
    // Alleen in de demo-versie. De echte versie volgt later.
    ...(isDemo
      ? [{ id: 'koersen' as Page, label: 'Koersen', icon: <Activity className="w-4 h-4" aria-hidden="true" /> }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-20 bg-[rgb(var(--surface))]/90 backdrop-blur-md border-b border-[rgb(var(--border))]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <span className="font-bold text-[rgb(var(--text-primary))]">Beleggingen</span>

        <nav className="flex items-center gap-1" aria-label="Hoofdnavigatie">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
              className={`inline-flex items-center justify-center gap-1.5 min-w-[44px] sm:min-w-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycle}
            className="inline-flex items-center justify-center min-w-[44px] sm:min-w-0 px-2.5 py-2 rounded-lg text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))] transition-colors"
            title={`${themeLabel} (klik om te wisselen)`}
            aria-label={`${themeLabel}. Klik om te wisselen tussen apparaat, licht en donker.`}
          >
            <ThemeIcon className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              fetch('/api/logout', { method: 'POST' }).finally(() => location.reload());
            }}
            className="inline-flex items-center justify-center gap-1.5 min-w-[44px] sm:min-w-0 px-2.5 py-2 rounded-lg text-xs font-medium text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))] transition-colors"
            title="Uitloggen"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Uitloggen</span>
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="bg-[rgb(var(--banner-bg))] border-t border-[rgb(var(--banner-border))]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1.5 text-[11px] text-[rgb(var(--banner-text))]">
            <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>
              {demoReason === 'account'
                ? 'Demo-account — dit zijn voorbeeldgegevens, geen echte portefeuille.'
                : 'Demodata — nog geen echte transacties binnengekomen via Gmail/n8n.'}
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
