import React from 'react';
import { LayoutDashboard, ArrowLeftRight, Info, LogOut } from 'lucide-react';

export type Page = 'overzicht' | 'transacties';

interface NavProps {
  page: Page;
  onNavigate: (page: Page) => void;
  isDemo: boolean;
}

export const Nav: React.FC<NavProps> = ({ page, onNavigate, isDemo }) => {
  const items: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'overzicht', label: 'Overzicht', icon: <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> },
    { id: 'transacties', label: 'Transacties', icon: <ArrowLeftRight className="w-4 h-4" aria-hidden="true" /> },
  ];

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[rgb(var(--border))]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <span className="font-bold text-[rgb(var(--text-primary))]">Beleggingen</span>

        <nav className="flex items-center gap-1" aria-label="Hoofdnavigatie">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                page === item.id
                  ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--series-1))]'
                  : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
              }`}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => {
            fetch('/api/logout', { method: 'POST' }).finally(() => location.reload());
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))] transition-colors"
          title="Uitloggen"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Uitloggen</span>
        </button>
      </div>

      {isDemo && (
        <div className="bg-amber-50 border-t border-amber-200/70">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1.5 text-[11px] text-amber-800">
            <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Demodata — nog geen echte transacties binnengekomen via Gmail/n8n.</span>
          </div>
        </div>
      )}
    </header>
  );
};
