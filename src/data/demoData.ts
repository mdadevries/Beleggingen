import { MarketInfo, QuoteInfo, Stock, Transaction } from './types.ts';

// Demodata — geen koppeling met een echte broker of bankrekening (zie
// privacy-overweging: voor de eerste versie tonen we alleen voorbeelddata).

export const DEMO_STOCKS: Stock[] = [
  { ticker: 'ASML', name: 'ASML Holding', currentPrice: 780, colorSlot: 1 },
  { ticker: 'SHELL', name: 'Shell plc', currentPrice: 31.5, colorSlot: 2 },
  { ticker: 'ING', name: 'ING Groep', currentPrice: 16.8, colorSlot: 3 },
  { ticker: 'ADYEN', name: 'Adyen', currentPrice: 1650, colorSlot: 4 },
  // Prosus staat in de demo op de laatste transactieprijs (zie DEMO_QUOTES).
  { ticker: 'PROSUS', name: 'Prosus', currentPrice: 37.4, colorSlot: 5 },
  { ticker: 'VANGUA', name: 'Vanguard FTSE All-World UCITS ETF', currentPrice: 167.14, colorSlot: 1 },
];

// Voorbeeld van hoe /api/quotes per aandeel antwoordt. Puur demo: een
// demo-sessie roept /api/quotes nooit aan. Alle vier de situaties komen voor:
// Twelve Data, justETF voor een ETF, omrekenen van pence, Yahoo als reserve,
// en terugval op de laatste transactieprijs.
export const DEMO_QUOTES: QuoteInfo[] = [
  { ticker: 'ASML', source: 'twelvedata', symbol: 'ASML', currency: 'EUR', price: 780, asOf: '2026-10-05T13:28:00Z' },
  {
    ticker: 'SHELL',
    source: 'twelvedata',
    symbol: 'SHEL',
    currency: 'GBp',
    price: 31.5,
    asOf: '2026-10-05T13:28:00Z',
    note: 'Koers in pence, omgerekend naar euro',
  },
  { ticker: 'ING', source: 'twelvedata', symbol: 'INGA', currency: 'EUR', price: 16.8, asOf: '2026-10-05T13:28:00Z' },
  {
    ticker: 'ADYEN',
    source: 'yahoo',
    symbol: 'ADYEN.AS',
    currency: 'EUR',
    price: 1650,
    asOf: '2026-10-05T13:25:00Z',
    note: 'Twelve Data gaf hier geen koers, Yahoo sprong bij',
  },
  {
    ticker: 'VANGUA',
    source: 'justetf',
    symbol: 'IE00B3RBWM25',
    currency: 'EUR',
    price: 167.14,
    asOf: '2026-10-05T15:30:00Z',
    note: 'ETF: opgezocht op ISIN, koers al in euro',
  },
  {
    ticker: 'PROSUS',
    source: 'transactieprijs',
    price: 37.4,
    note: 'Geen live koers gevonden, dit is je laatste transactieprijs',
  },
];

// Marktgegevens voor de demo-detailpagina's (verzonnen voorbeeldwaarden).
export const DEMO_MARKET: Record<string, MarketInfo> = {
  ASML: {
    live: true, changePct: 0.0124, range52: { low: 590, high: 835 }, exchange: 'Euronext Amsterdam', currency: 'EUR',
    dividends: [
      { date: '2025-10-29', amount: 1.52 },
      { date: '2026-02-04', amount: 1.52 },
      { date: '2026-04-29', amount: 1.7 },
      { date: '2026-07-29', amount: 1.7 },
    ],
  },
  SHELL: {
    live: true, changePct: -0.0061, range52: { low: 26.1, high: 33.4 }, exchange: 'Londen (LSE)', currency: 'GBp',
    dividends: [
      { date: '2025-11-13', amount: 0.31 },
      { date: '2026-02-26', amount: 0.31 },
      { date: '2026-05-14', amount: 0.32 },
      { date: '2026-08-13', amount: 0.32 },
    ],
  },
  ING: {
    live: true, changePct: 0.0042, range52: { low: 13.8, high: 17.9 }, exchange: 'Euronext Amsterdam', currency: 'EUR',
    dividends: [
      { date: '2026-04-28', amount: 0.74 },
      { date: '2026-08-03', amount: 0.37 },
    ],
  },
  ADYEN: { live: true, changePct: 0.0215, range52: { low: 1210, high: 1710 }, exchange: 'Euronext Amsterdam', currency: 'EUR', dividends: [] },
  PROSUS: { live: false, exchange: 'Euronext Amsterdam', currency: 'EUR' },
  VANGUA: {
    live: true, source: 'justetf', changePct: 0.0086, range52: { low: 136.8, high: 167.37 }, exchange: 'Xetra (Frankfurt)', currency: 'EUR',
    dividends: [
      { date: '2025-12-24', amount: 0.62 },
      { date: '2026-03-26', amount: 0.41 },
      { date: '2026-06-25', amount: 0.78 },
      { date: '2026-09-24', amount: 0.55 },
    ],
  },
};

export const DEMO_TRANSACTIONS: Transaction[] = [
  { id: 't1', date: '2026-01-15', ticker: 'ASML', type: 'Kopen', quantity: 2, price: 680 },
  { id: 't2', date: '2026-01-22', ticker: 'ING', type: 'Kopen', quantity: 50, price: 14.9 },
  { id: 't3', date: '2026-02-05', ticker: 'SHELL', type: 'Kopen', quantity: 20, price: 28.4 },
  { id: 't4', date: '2026-02-27', ticker: 'PROSUS', type: 'Kopen', quantity: 25, price: 33.1 },
  { id: 't14', date: '2026-03-02', ticker: 'VANGUA', type: 'Kopen', quantity: 8, price: 141.2 },
  { id: 't5', date: '2026-03-11', ticker: 'ADYEN', type: 'Kopen', quantity: 1, price: 1420 },
  { id: 't6', date: '2026-04-10', ticker: 'ASML', type: 'Kopen', quantity: 1, price: 720 },
  { id: 't7', date: '2026-05-14', ticker: 'ING', type: 'Kopen', quantity: 30, price: 15.6 },
  { id: 't15', date: '2026-06-01', ticker: 'VANGUA', type: 'Kopen', quantity: 6, price: 150.6 },
  { id: 't8', date: '2026-06-09', ticker: 'PROSUS', type: 'Kopen', quantity: 15, price: 35.8 },
  { id: 't9', date: '2026-06-18', ticker: 'SHELL', type: 'Kopen', quantity: 15, price: 29.75 },
  { id: 't10', date: '2026-07-02', ticker: 'ASML', type: 'Verkopen', quantity: 1, price: 760 },
  { id: 't11', date: '2026-08-03', ticker: 'ING', type: 'Verkopen', quantity: 20, price: 17.1 },
  { id: 't12', date: '2026-08-20', ticker: 'ADYEN', type: 'Kopen', quantity: 1, price: 1580 },
  { id: 't13', date: '2026-09-05', ticker: 'PROSUS', type: 'Kopen', quantity: 10, price: 37.4 },
];
