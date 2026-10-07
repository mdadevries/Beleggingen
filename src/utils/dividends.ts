import { MarketInfo, StockPosition, Transaction } from '../data/types.ts';

export interface DividendRow {
  ticker: string;
  name: string;
  /** Bedrag per aandeel over de afgelopen 12 maanden */
  perShareYear: number;
  /** Geschat ontvangen in de afgelopen 12 maanden (stukken op de uitkeringsdatum) */
  received: number;
  /** Verwacht komende 12 maanden: dividend van het afgelopen jaar x stukken van nu */
  expected: number;
  /** Verwacht dividend als deel van de waarde van de positie */
  yieldPct: number;
  lastDate: string;
  payments: number;
}

export interface DividendSummary {
  rows: DividendRow[];
  received: number;
  expected: number;
  /** Verwacht dividend / waarde van de hele portefeuille */
  yieldPct: number;
  /** Aandelen waarvan we weten dat ze (het afgelopen jaar) niets uitkeerden */
  noDividend: string[];
  /** Aandelen waarvan geen dividendgegevens bekend zijn (geen live koers) */
  unknown: string[];
}

/** Aantal stukken dat je op een datum (einde van die dag) had. */
export function sharesOn(ticker: string, date: string, transactions: Transaction[]): number {
  let n = 0;
  for (const t of transactions) {
    if (t.ticker !== ticker || t.date > date) continue;
    n += t.type === 'Kopen' ? t.quantity : -t.quantity;
  }
  return Math.max(0, n);
}

/**
 * Schat je dividend op basis van wat elk aandeel het afgelopen jaar uitkeerde.
 * Bruto (voor bronbelasting) en een schatting, geen toezegging van het bedrijf.
 */
export function computeDividends(
  positions: StockPosition[],
  transactions: Transaction[],
  market: Record<string, MarketInfo>
): DividendSummary {
  const rows: DividendRow[] = [];
  const noDividend: string[] = [];
  const unknown: string[] = [];

  for (const p of positions) {
    const divs = market[p.stock.ticker]?.dividends;
    if (!divs) {
      unknown.push(p.stock.ticker);
      continue;
    }
    if (divs.length === 0) {
      noDividend.push(p.stock.ticker);
      continue;
    }
    const perShareYear = divs.reduce((s, d) => s + d.amount, 0);
    const received = divs.reduce((s, d) => s + d.amount * sharesOn(p.stock.ticker, d.date, transactions), 0);
    const expected = perShareYear * p.sharesHeld;
    rows.push({
      ticker: p.stock.ticker,
      name: p.stock.name,
      perShareYear,
      received,
      expected,
      yieldPct: p.currentValue > 0 ? expected / p.currentValue : 0,
      lastDate: divs[divs.length - 1].date,
      payments: divs.length,
    });
  }

  rows.sort((a, b) => b.expected - a.expected);
  const total = positions.reduce((s, p) => s + p.currentValue, 0);
  const expected = rows.reduce((s, r) => s + r.expected, 0);
  return {
    rows,
    received: rows.reduce((s, r) => s + r.received, 0),
    expected,
    yieldPct: total > 0 ? expected / total : 0,
    noDividend,
    unknown,
  };
}
