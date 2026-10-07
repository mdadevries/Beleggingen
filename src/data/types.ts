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
  /** Aandeel in de totale portefeuille, 0-1 */
  allocation: number;
}
