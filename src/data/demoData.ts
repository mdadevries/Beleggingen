import { MarketInfo, QuoteInfo, Stock, Transaction, WeeklyReport } from './types.ts';

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

// Voorbeeld-weekrapport voor de demo (verzonnen cijfers en tekst). Een demo-sessie roept
// /api/reports nooit aan, dus hier komt nooit echte data in.
export const DEMO_REPORTS: WeeklyReport[] = [
  {
    weekStart: '2026-10-05',
    weekEnd: '2026-10-11',
    createdAt: '2026-10-11T17:05:00Z',
    model: 'voorbeeld',
    stats: {
      asOf: '2026-10-11T17:00:00Z',
      periodStart: '2026-10-04',
      periodEnd: '2026-10-11',
      totalValue: 11180,
      invested: 10240,
      returnPct: 0.0918,
      weekChangePct: 0.0142,
      weekChangeAmount: 157,
      coverage: 1,
      etfShare: 0.42,
      top1: { ticker: 'VANGUA', share: 0.42 },
      top3Share: 0.78,
      currency: [
        { currency: 'EUR', share: 0.86 },
        { currency: 'GBP', share: 0.14 },
      ],
      expectedDividendYear: 214,
      soldThisWeek: [],
      positions: [
        { ticker: 'VANGUA', name: 'Vanguard FTSE All-World UCITS ETF', isEtf: true, value: 4696, allocation: 0.42, price: 167.14, weekChangePct: 0.0108, weekChangeAmount: 50, totalReturnPct: 0.112, newThisWeek: false },
        { ticker: 'ASML', name: 'ASML Holding', isEtf: false, value: 2340, allocation: 0.209, price: 780, weekChangePct: 0.0312, weekChangeAmount: 71, totalReturnPct: 0.164, newThisWeek: false },
        { ticker: 'SHELL', name: 'Shell plc', isEtf: false, value: 1575, allocation: 0.141, price: 31.5, weekChangePct: -0.0094, weekChangeAmount: -15, totalReturnPct: 0.031, newThisWeek: false },
        { ticker: 'ING', name: 'ING Groep', isEtf: false, value: 1344, allocation: 0.12, price: 16.8, weekChangePct: 0.0121, weekChangeAmount: 16, totalReturnPct: 0.082, newThisWeek: false },
        { ticker: 'ADYEN', name: 'Adyen', isEtf: false, value: 825, allocation: 0.074, price: 1650, weekChangePct: 0.0268, weekChangeAmount: 21, totalReturnPct: 0.054, newThisWeek: false },
        { ticker: 'PROSUS', name: 'Prosus', isEtf: false, value: 400, allocation: 0.036, price: 37.4, weekChangePct: null, weekChangeAmount: null, totalReturnPct: -0.012, newThisWeek: false },
      ],
    },
    content: {
      headline: 'Rustige groene week, ASML trok de portefeuille omhoog',
      summary:
        'Je portefeuille steeg deze week met 1,4%. ASML deed het met +3,1% het best, gevolgd door Adyen (+2,7%). Shell was de enige positie die daalde (-0,9%). De ETF liep mee met de markt en steeg 1,1%.',
      movers: [
        { ticker: 'ASML', comment: 'Steeg 3,1% en is nu je grootste losse aandeel, ruim 20% van de portefeuille.' },
        { ticker: 'ADYEN', comment: 'Plus 2,7%, een kleinere positie die toch merkbaar bijdroeg.' },
        { ticker: 'SHELL', comment: 'Min 0,9%, de enige daler van de week.' },
      ],
      concentration:
        'Je grootste positie is de ETF met 42%; de top 3 is samen 78%. Ongeveer 14% van je geld noteert in ponden, de rest in euro.',
      split: 'ETF\'s vormen 42% van je portefeuille, losse aandelen 58%. Het ETF-deel bewoog rustiger dan de losse aandelen.',
      upcoming: 'Er is voor de komende 45 dagen geen uitkering bekend. Uitkeringen zijn altijd een schatting op basis van vorig jaar.',
      dataNote: 'Voor Prosus is geen vergelijking met vorige week mogelijk, die koers is nog de laatste transactieprijs.',
    },
  },
];
