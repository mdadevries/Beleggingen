import { useCallback, useEffect, useRef, useState } from 'react';
import { MarketInfo, Stock, Transaction } from '../data/types.ts';
import { DEMO_MARKET, DEMO_STOCKS, DEMO_TRANSACTIONS } from '../data/demoData.ts';

export type DemoReason = 'account' | 'no-data' | null;

/** Hoeveel aandelen een live koers kregen (anders: laatste transactieprijs). */
export interface QuoteStatus {
  live: number;
  total: number;
  /** Nieuwste tijdstip van de gebruikte koersen (ISO), indien bekend */
  asOf: string | null;
  /** Wanneer de koersen voor het laatst bij de bron zijn opgehaald (dagelijkse update of handmatig) */
  updatedAt: string | null;
}

interface PortfolioData {
  stocks: Stock[];
  transactions: Transaction[];
  isDemo: boolean;
  /** Waarom er demodata getoond wordt: expliciet demo-account, of (nog) geen
   *  echte transacties. Bepaalt welke banner-tekst Nav toont. null = geen demo. */
  demoReason: DemoReason;
  loading: boolean;
  error: string | null;
  /** null = (nog) niet geprobeerd of niet van toepassing (demo) */
  quoteStatus: QuoteStatus | null;
  /** Marktgegevens per ticker (dagverandering, 52-wekenbereik, beurs). */
  market: Record<string, MarketInfo>;
  /** Bezig met handmatig verversen? */
  refreshing: boolean;
  /** Haal nu nieuwe koersen op (de server laat dit hooguit één keer per uur echt doorgaan). */
  refreshQuotes: () => void;
}

/** Wat /api/quotes per aandeel teruggeeft (alleen de velden die de site gebruikt). */
interface ApiQuote {
  price: number;
  asOf: string | null;
  currency?: string;
  source?: 'twelvedata' | 'justetf' | 'finnhub' | 'yahoo';
  changePct?: number | null;
  range52?: { low: number; high: number } | null;
  exchange?: string | null;
  dividends?: { date: string; amount: number }[];
}

/**
 * Bepaalt eerst via /api/session of dit een demo-sessie is (geen wachtwoord,
 * via de "Doorgaan met demo-account"-knop). Een demo-sessie roept
 * /api/transactions nooit aan — zo kan een demo-login nooit per ongeluk
 * echte financiële data laten zien.
 *
 * Voor een echte sessie: haal /api/transactions op. Zolang daar nog niets
 * binnen is — of bij een netwerkfout — val je terug op demodata, zodat de
 * site nooit leeg oogt.
 */
export function usePortfolioData(): PortfolioData {
  const refreshRef = useRef<() => void>(() => undefined);
  const refreshQuotes = useCallback(() => refreshRef.current(), []);
  const [state, setState] = useState<Omit<PortfolioData, 'refreshQuotes'>>({
    stocks: DEMO_STOCKS,
    transactions: DEMO_TRANSACTIONS,
    isDemo: true,
    demoReason: null,
    loading: true,
    error: null,
    quoteStatus: null,
    market: DEMO_MARKET,
    refreshing: false,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    fetch('/api/session')
      .then((res) => (res.ok ? res.json() : { role: 'real' }))
      // Faalt /api/session (netwerk, geen JSON)? Behandel als gewone sessie:
      // we vallen dan alsnog terug op demodata als er niets binnenkomt, en de
      // pagina blijft nooit op "Laden…" hangen.
      .catch(() => ({ role: 'real' }))
      .then((session: { role: 'real' | 'demo' | 'none' }) => {
        if (cancelled) return;

        if (session.role === 'demo') {
          setState({
            stocks: DEMO_STOCKS,
            transactions: DEMO_TRANSACTIONS,
            isDemo: true,
            demoReason: 'account',
            loading: false,
            error: null,
            quoteStatus: null,
            market: DEMO_MARKET,
            refreshing: false,
          });
          return; // nooit /api/transactions aanroepen voor een demo-sessie
        }

        fetch('/api/transactions')
          .then((res) => {
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return res.json();
          })
          .then((data: { stocks: Stock[]; transactions: Transaction[] }) => {
            if (cancelled) return;
            if (data.transactions && data.transactions.length > 0) {
              setState({
                stocks: data.stocks,
                transactions: data.transactions,
                isDemo: false,
                demoReason: null,
                loading: false,
                error: null,
                quoteStatus: null,
                market: {},
                refreshing: false,
              });
              // Alleen aandelen die je nog hebt: verkochte posities hoeven geen koers.
              const net = new Map<string, number>();
              for (const t of data.transactions) {
                net.set(t.ticker, (net.get(t.ticker) ?? 0) + (t.type === 'Kopen' ? t.quantity : -t.quantity));
              }
              const tracked = data.stocks.filter((s) => (net.get(s.ticker) ?? 0) > 1e-9);
              const toTrack = tracked.length > 0 ? tracked : data.stocks;
              refreshRef.current = () => {
                setState((st) => ({ ...st, refreshing: true }));
                loadQuotes(toTrack, 0, true);
              };
              loadQuotes(toTrack);
            } else {
              setState((s) => ({ ...s, demoReason: 'no-data', loading: false }));
            }
          })
          .catch((err) => {
            if (cancelled) return;
            setState((s) => ({
              ...s,
              demoReason: 'no-data',
              loading: false,
              error: err instanceof Error ? err.message : 'Onbekende fout',
            }));
          });
      });

    /**
     * Echte koersen er achteraan: de pagina verschijnt meteen met de laatste
     * transactieprijs, en zodra /api/quotes antwoordt worden de koersen
     * bijgewerkt. Faalt dat (Yahoo weg, niet gevonden), dan blijft alles zoals
     * het was en zegt quoteStatus dat eerlijk.
     */
    function loadQuotes(stocks: Stock[], attempt = 0, manual = false) {
      // Zijn nog niet alle koersen binnen (het gratis koersenbudget is per minuut beperkt),
      // dan vragen we na ruim een minuut nog een paar keer opnieuw.
      const retryLater = () => {
        if (attempt < 3 && !cancelled) timer = setTimeout(() => loadQuotes(stocks, attempt + 1), 65_000);
      };
      fetch(manual ? '/api/quotes?refresh=1' : '/api/quotes')
        .then((res) => {
          if (!res.ok) throw new Error(`Status ${res.status}`);
          return res.json();
        })
        .then((data: { quotes: Record<string, ApiQuote>; updatedAt?: string | null }) => {
          if (cancelled) return;
          const quotes = data.quotes ?? {};
          const live = stocks.filter((s) => quotes[s.ticker]).length;
          const asOf =
            Object.values(quotes)
              .map((q) => q.asOf)
              .filter((t): t is string => !!t)
              .sort()
              .pop() ?? null;
          const market: Record<string, MarketInfo> = {};
          for (const s of stocks) {
            const q = quotes[s.ticker];
            market[s.ticker] = q
              ? {
                  live: true,
                  changePct: q.changePct ?? null,
                  range52: q.range52 ?? null,
                  exchange: q.exchange ?? null,
                  currency: q.currency ?? null,
                  asOf: q.asOf,
                  source: q.source ?? null,
                  dividends: q.dividends ?? null,
                }
              : { live: false };
          }
          setState((st) => ({
            ...st,
            market,
            stocks: st.stocks.map((s) => (quotes[s.ticker] ? { ...s, currentPrice: quotes[s.ticker].price } : s)),
            quoteStatus: { live, total: stocks.length, asOf, updatedAt: data.updatedAt ?? null },
            refreshing: false,
          }));
          // Ook nog eens vragen als dividend nog voor sommige aandelen ontbreekt: dat komt per ronde een paar tegelijk binnen.
          const dividendPending = stocks.some((s) => quotes[s.ticker] && quotes[s.ticker].dividends === undefined);
          if (live < stocks.length || dividendPending) retryLater();
        })
        .catch(() => {
          if (cancelled) return;
          setState((st) => ({
            ...st,
            refreshing: false,
            quoteStatus: st.quoteStatus && st.quoteStatus.live > 0 ? st.quoteStatus : { live: 0, total: stocks.length, asOf: null, updatedAt: null },
          }));
          retryLater();
        });
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { ...state, refreshQuotes };
}
