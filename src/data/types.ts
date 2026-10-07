export interface Stock {
  ticker: string;
  name: string;
  /** Huidige koers per aandeel, in euro's */
  currentPrice: number;
  /** Kleursleutel voor grafieken (categorical palette, vaste volgorde) */
  colorSlot: 1 | 2 | 3 | 4 | 5;
  /** Alleen voor echte data (door de backend gebruikt om koersen op te zoeken). */
  isin?: string;
}

/** Waar de koers van één aandeel vandaan komt (zelfde idee als /api/quotes). */
export type QuoteSource = 'twelvedata' | 'yahoo' | 'transactieprijs';

export interface QuoteInfo {
  ticker: string;
  source: QuoteSource;
  /** Symbool bij de bron, bv. "ASML" of "ADYEN.AS". Leeg bij laatste transactieprijs. */
  symbol?: string;
  /** Valuta waarin de bron de koers gaf (vóór omrekenen naar euro) */
  currency?: string;
  /** Koers per stuk in euro's */
  price: number;
  /** Tijdstip van de koers volgens de bron (ISO), indien bekend */
  asOf?: string;
  /** Korte uitleg voor de gebruiker, bv. "Omgerekend van pence" */
  note?: string;
  /** Gevuld als de koers sterk afwijkt van de laatste transactieprijs */
  warning?: string;
}

/** Marktgegevens van /api/quotes (alles optioneel: ontbreekt het, dan tonen we het niet). */
export interface MarketInfo {
  /** Verandering t.o.v. vorige slotkoers, als fractie (0.012 = +1,2%) */
  changePct?: number | null;
  /** Laagste/hoogste koers van de afgelopen 52 weken, in euro's */
  range52?: { low: number; high: number } | null;
  /** Naam van de beurs, bv. "NASDAQ" */
  exchange?: string | null;
  /** Valuta waarin het aandeel noteert, bv. "USD" */
  currency?: string | null;
  /** Tijdstip van de koers (ISO) */
  asOf?: string | null;
  /** Is dit een echte koers (true) of de laatste transactieprijs (false)? */
  live: boolean;
  /** Uitkeringen van de afgelopen 12 maanden, per aandeel in euro's. Ontbreekt = onbekend, [] = geen dividend. */
  dividends?: { date: string; amount: number }[] | null;
}

export type TransactionType = 'Kopen' | 'Verkopen';

export interface Transaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  ticker: string;
  type: TransactionType;
  quantity: number;
  /** Prijs per aandeel op moment van transactie, in euro's */
  price: number;
}

export interface ValuePoint {
  date: string; // ISO yyyy-mm-dd, maandultimo
  value: number;
}

export interface StockPosition {
  stock: Stock;
  sharesHeld: number;
  /** Gemiddelde aankoopkoers van de nog aangehouden stukken */
  avgBuyPrice: number;
  /** Ingelegd bedrag voor de nog aangehouden stukken (kostenbasis) */
  invested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
  /** Gerealiseerd resultaat op verkochte stukken (zonder kosten) */
  realized: number;
  /** Aandeel in de totale portefeuille, 0-1 */
  allocation: number;
}

/** Eén moment in het geschatte waardeverloop van de hele portefeuille. */
export interface SeriesPoint {
  date: string; // ISO yyyy-mm-dd
  t: number; // tijdstip in ms (UTC middernacht)
  /** Waarde per aandeel (ticker -> euro) */
  values: Record<string, number>;
  total: number;
  /** Ingelegd bedrag (kostenbasis) op dat moment */
  cost: number;
}
