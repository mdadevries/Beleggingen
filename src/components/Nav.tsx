import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Activity,
  Info,
  LogOut,
  Sun,
  Moon,
  Eye,
  EyeOff,
  LineChart,
  GraduationCap,
  FileText,
  Microscope,
  Flag,
  Telescope,
  MessageCircle,
  Sparkles,
  Search,
  MoreHorizontal,
  ChevronDown,
  X,
  UserRound,
} from 'lucide-react';
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
  onOpenSearch: () => void;
}

/** Het thema wisselen vanuit een ander onderdeel (zoals het snelzoekmenu). */
export const TOGGLE_THEME_EVENT = 'beleggingen:toggle-theme';

const iconBtn =
  'inline-flex items-center justify-center gap-1.5 min-w-[36px] sm:min-w-0 px-1.5 sm:px-2.5 py-2 rounded-lg text-xs font-medium transition-colors';

interface Item {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

const ic = 'w-4 h-4';
export const NAV_ITEMS: Record<Page, Item> = {
  overzicht: { id: 'overzicht', label: 'Overzicht', icon: <LayoutDashboard className={ic} aria-hidden="true" /> },
  transacties: { id: 'transacties', label: 'Transacties', icon: <ArrowLeftRight className={ic} aria-hidden="true" /> },
  inzicht: { id: 'inzicht', label: 'Inzicht', icon: <Microscope className={ic} aria-hidden="true" /> },
  race: { id: 'race', label: 'Race', icon: <Flag className={ic} aria-hidden="true" /> },
  toekomst: { id: 'toekomst', label: 'Toekomst', icon: <Telescope className={ic} aria-hidden="true" /> },
  chat: { id: 'chat', label: 'Chat', icon: <MessageCircle className={ic} aria-hidden="true" /> },
  wrapped: { id: 'wrapped', label: 'Wrapped', icon: <Sparkles className={ic} aria-hidden="true" /> },
  weekrapport: { id: 'weekrapport', label: 'Weekrapport', icon: <FileText className={ic} aria-hidden="true" /> },
  studieschuld: { id: 'studieschuld', label: 'Studieschuld', icon: <GraduationCap className={ic} aria-hidden="true" /> },
  koersen: { id: 'koersen', label: 'Koersen', icon: <Activity className={ic} aria-hidden="true" /> },
  account: { id: 'account', label: 'Account', icon: <UserRound className={ic} aria-hidden="true" /> },
};

export const Nav: React.FC<NavProps> = ({ page, onNavigate, isDemo, demoReason, onOpenSearch }) => {
  const { dark, toggle: toggleTheme } = useTheme();
  const { hidden, toggle: togglePrivacy } = usePrivacy();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onToggle = () => toggleTheme();
    window.addEventListener(TOGGLE_THEME_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_THEME_EVENT, onToggle);
  }, [toggleTheme]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreOpen]);

  const primary: Page[] = ['overzicht', 'transacties', 'inzicht', 'race', 'toekomst', 'chat'];
  const more: Page[] = ['weekrapport', 'studieschuld', 'account', ...(isDemo ? (['koersen'] as Page[]) : [])];
  const mobileTabs: Page[] = ['overzicht', 'transacties', 'inzicht', 'chat'];
  const mobileMore: Page[] = ['race', 'toekomst', 'wrapped', 'weekrapport', 'studieschuld', 'account', ...(isDemo ? (['koersen'] as Page[]) : [])];
  const go = (p: Page) => {
    setMoreOpen(false);
    setSheetOpen(false);
    onNavigate(p);
  };
  const isMoreActive = more.includes(page);
  const isMobileMoreActive = mobileMore.includes(page);

  return (
    <>
      <header className="no-print sticky top-0 z-30 bg-[rgb(var(--surface))]/90 backdrop-blur-md border-b border-[rgb(var(--border))]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-1.5 sm:gap-3">
          <button type="button" onClick={() => go('overzicht')} className="flex items-center gap-2 font-bold text-[rgb(var(--text-primary))] shrink-0" aria-label="Naar het overzicht">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2a78d6] to-[#8b5cf6] text-white flex items-center justify-center" aria-hidden="true">
              <LineChart className="w-4 h-4" />
            </span>
            <span className="hidden min-[420px]:inline md:hidden lg:inline">Beleggingen</span>
          </button>

          {/* Desktop */}
          <nav className="hidden md:flex items-center gap-0.5" aria-label="Hoofdnavigatie">
            {primary.map((id) => {
              const item = NAV_ITEMS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  aria-current={page === id ? 'page' : undefined}
                  className={`${iconBtn} text-sm ${
                    page === id ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]' : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
                  }`}
                >
                  {item.icon}
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="lg:hidden sr-only">{item.label}</span>
                </button>
              );
            })}
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                className={`${iconBtn} text-sm ${isMoreActive ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]' : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'}`}
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                <span className="hidden lg:inline">Meer</span>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              </button>
              {moreOpen && (
                <div role="menu" className="absolute right-0 mt-1 w-48 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg p-1">
                  {more.map((id) => (
                    <button
                      key={id}
                      role="menuitem"
                      type="button"
                      onClick={() => go(id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left ${
                        page === id ? 'text-[rgb(var(--accent-text))] bg-[rgb(var(--series-1))]/10' : 'text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
                      }`}
                    >
                      {NAV_ITEMS[id].icon}
                      {NAV_ITEMS[id].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onOpenSearch}
              className={`${iconBtn} text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-secondary))]`}
              title="Snel zoeken (⌘K)"
              aria-label="Snel zoeken"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
              <kbd className="hidden xl:inline text-[10px] font-semibold border border-[rgb(var(--border))] rounded px-1">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => go('wrapped')}
              className={`${iconBtn} text-[#8b5cf6] hover:bg-[#8b5cf6]/10`}
              title="Jouw beleggings-Wrapped"
              aria-label="Open je Wrapped"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </button>
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
              <span className="sr-only">Anoniem</span>
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
              aria-label="Uitloggen"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
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

      {/* Telefoon: onderbalk zoals een echte app */}
      <nav
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-[rgb(var(--surface))]/95 backdrop-blur-md border-t border-[rgb(var(--border))] safe-bottom"
        aria-label="Hoofdnavigatie"
      >
        <div className="grid grid-cols-5">
          {mobileTabs.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={page === id ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-semibold ${page === id ? 'text-[rgb(var(--accent-text))]' : 'text-[rgb(var(--text-muted))]'}`}
            >
              <span className={`px-3 py-1 rounded-full transition-colors ${page === id ? 'bg-[rgb(var(--series-1))]/12' : ''}`}>{NAV_ITEMS[id].icon}</span>
              {NAV_ITEMS[id].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            className={`flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-semibold ${isMobileMoreActive ? 'text-[rgb(var(--accent-text))]' : 'text-[rgb(var(--text-muted))]'}`}
          >
            <span className={`px-3 py-1 rounded-full ${isMobileMoreActive ? 'bg-[rgb(var(--series-1))]/12' : ''}`}>
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </span>
            Meer
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Meer pagina's">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} aria-label="Sluiten" />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-[rgb(var(--surface))] p-4 pb-6 safe-bottom shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-[rgb(var(--text-primary))]">Meer</p>
              <button type="button" onClick={() => setSheetOpen(false)} className="p-1.5 rounded-full hover:bg-[rgb(var(--surface-sunken))]" aria-label="Sluiten">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {mobileMore.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold ${
                    page === id ? 'border-[rgb(var(--series-1))] text-[rgb(var(--accent-text))]' : 'border-[rgb(var(--border))] text-[rgb(var(--text-secondary))]'
                  } ${id === 'wrapped' ? 'bg-gradient-to-br from-[#8b5cf6]/15 to-[#db2777]/15' : ''}`}
                >
                  {NAV_ITEMS[id].icon}
                  {NAV_ITEMS[id].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
