import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Eye, SunMoon, RefreshCw, LogOut, Bot } from 'lucide-react';
import { Page } from '../hooks/useHashRoute.ts';
import { StockPosition } from '../data/types.ts';
import { NAV_ITEMS, TOGGLE_THEME_EVENT } from './Nav.tsx';
import { shortName } from '../utils/names.ts';
import { formatPercent } from '../utils/portfolio.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';

interface Props {
  open: boolean;
  onClose: () => void;
  positions: StockPosition[];
  isDemo: boolean;
  onPage: (p: Page) => void;
  onStock: (ticker: string) => void;
  onRefresh: () => void;
  onAsk: (q: string) => void;
}

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords: string;
  run: () => void;
}

/** Snel zoeken met ⌘K / Ctrl+K: pagina's, aandelen en acties, alles met het toetsenbord. */
export const CommandPalette: React.FC<Props> = ({ open, onClose, positions, isDemo, onPage, onStock, onRefresh, onAsk }) => {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toggle: togglePrivacy } = usePrivacy();

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const entries: Entry[] = useMemo(() => {
    const pages: Page[] = ['overzicht', 'transacties', 'inzicht', 'race', 'toekomst', 'chat', 'wrapped', 'weekrapport', 'studieschuld', ...(isDemo ? (['koersen'] as Page[]) : [])];
    const extra: Record<string, string> = {
      inzicht: 'analyse score spreiding concurrent second best ideeen duels',
      race: 'markt index sp500 s&p nasdaq benchmark',
      toekomst: 'simulator monte carlo toekomstmachine pensioen doel',
      chat: 'ai vraag gemini assistent',
      wrapped: 'jaaroverzicht story spotify',
    };
    return [
      ...pages.map((p) => ({
        id: 'p-' + p,
        group: "Pagina's",
        label: NAV_ITEMS[p].label,
        icon: NAV_ITEMS[p].icon,
        keywords: `${p} ${extra[p] ?? ''}`,
        run: () => onPage(p),
      })),
      ...positions.map((p) => ({
        id: 's-' + p.stock.ticker,
        group: 'Aandelen',
        label: shortName(p.stock.name),
        hint: p.invested > 0 ? formatPercent(p.profitLossPct) : undefined,
        icon: <span className="w-4 h-4 rounded bg-[rgb(var(--series-1))]/15 text-[9px] font-black flex items-center justify-center text-[rgb(var(--accent-text))]">{p.stock.ticker.slice(0, 2)}</span>,
        keywords: `${p.stock.ticker} ${p.stock.name}`,
        run: () => onStock(p.stock.ticker),
      })),
      { id: 'a-anon', group: 'Acties', label: 'Anonieme modus aan/uit', icon: <Eye className="w-4 h-4" />, keywords: 'privacy verbergen bedragen', run: togglePrivacy },
      { id: 'a-theme', group: 'Acties', label: 'Licht/donker wisselen', icon: <SunMoon className="w-4 h-4" />, keywords: 'thema dark mode', run: () => window.dispatchEvent(new Event(TOGGLE_THEME_EVENT)) },
      ...(!isDemo ? [{ id: 'a-refresh', group: 'Acties', label: 'Koersen verversen', icon: <RefreshCw className="w-4 h-4" />, keywords: 'update quotes', run: onRefresh }] : []),
      { id: 'a-logout', group: 'Acties', label: 'Uitloggen', icon: <LogOut className="w-4 h-4" />, keywords: 'logout', run: () => fetch('/api/logout', { method: 'POST' }).finally(() => location.reload()) },
    ];
  }, [positions, isDemo, onPage, onStock, onRefresh, togglePrivacy]);

  const term = q.trim().toLowerCase();
  const filtered = term
    ? entries.filter((e) => `${e.label} ${e.keywords}`.toLowerCase().includes(term))
    : entries;
  // Niets gevonden en een echte vraag? Stel hem aan de AI.
  const askEntry: Entry | null =
    term.length > 3
      ? { id: 'ask', group: 'Vraag de AI', label: `"${q.trim()}"`, icon: <Bot className="w-4 h-4" />, keywords: '', run: () => onAsk(q.trim()) }
      : null;
  const list = askEntry ? [...filtered, askEntry] : filtered;

  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const run = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    e.run();
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Snel zoeken">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Sluiten" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-[rgb(var(--border))]">
          <Search className="w-4 h-4 text-[rgb(var(--text-muted))]" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(list.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(list[sel]);
              }
            }}
            placeholder="Zoek een pagina, aandeel of stel een vraag…"
            className="flex-1 bg-transparent py-3.5 text-[16px] sm:text-sm text-[rgb(var(--text-primary))] focus:outline-none"
            aria-label="Zoeken"
          />
          <kbd className="text-[10px] font-semibold border border-[rgb(var(--border))] rounded px-1.5 py-0.5 text-[rgb(var(--text-muted))]">esc</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5" role="listbox">
          {list.length === 0 && <p className="p-4 text-sm text-[rgb(var(--text-muted))]">Niets gevonden.</p>}
          {list.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <React.Fragment key={e.id}>
                {header && <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--text-muted))]">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(e)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left ${
                    i === sel ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--text-primary))]' : 'text-[rgb(var(--text-secondary))]'
                  }`}
                >
                  <span className="text-[rgb(var(--text-muted))] shrink-0">{e.icon}</span>
                  <span className="flex-1 truncate">{e.label}</span>
                  {e.hint && <span className="text-xs tabular text-[rgb(var(--text-muted))]">{e.hint}</span>}
                  {i === sel && <CornerDownLeft className="w-3.5 h-3.5 text-[rgb(var(--text-muted))]" aria-hidden="true" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
