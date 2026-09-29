export interface Stock {
  ticker: string;
  name: string;
  /** Huidige koers per aandeel, in euro's */
  currentPrice: number;
  /** Kleursleutel voor grafieken (categorical palette, vaste volgorde) */
  colorSlot: 1 | 2 | 3 | 4 | 5;
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
