import { Stock, Transaction } from './types.ts';

// Demodata — geen koppeling met een echte broker of bankrekening (zie
// privacy-overweging: voor de eerste versie tonen we alleen voorbeelddata).

export const DEMO_STOCKS: Stock[] = [
  { ticker: 'ASML', name: 'ASML Holding', currentPrice: 780, colorSlot: 1 },
  { ticker: 'SHELL', name: 'Shell plc', currentPrice: 31.5, colorSlot: 2 },
  { ticker: 'ING', name: 'ING Groep', currentPrice: 16.8, colorSlot: 3 },
  { ticker: 'ADYEN', name: 'Adyen', currentPrice: 1650, colorSlot: 4 },
  { ticker: 'PROSUS', name: 'Prosus', currentPrice: 38.2, colorSlot: 5 },
];

export const DEMO_TRANSACTIONS: Transaction[] = [
  { id: 't1', date: '2026-01-15', ticker: 'ASML', type: 'Kopen', quantity: 2, price: 680 },
  { id: 't2', date: '2026-01-22', ticker: 'ING', type: 'Kopen', quantity: 50, price: 14.9 },
  { id: 't3', date: '2026-02-05', ticker: 'SHELL', type: 'Kopen', quantity: 20, price: 28.4 },
  { id: 't4', date: '2026-02-27', ticker: 'PROSUS', type: 'Kopen', quantity: 25, price: 33.1 },
  { id: 't5', date: '2026-03-11', ticker: 'ADYEN', type: 'Kopen', quantity: 1, price: 1420 },
  { id: 't6', date: '2026-04-10', ticker: 'ASML', type: 'Kopen', quantity: 1, price: 720 },
  { id: 't7', date: '2026-05-14', ticker: 'ING', type: 'Kopen', quantity: 30, price: 15.6 },
  { id: 't8', date: '2026-06-09', ticker: 'PROSUS', type: 'Kopen', quantity: 15, price: 35.8 },
  { id: 't9', date: '2026-06-18', ticker: 'SHELL', type: 'Kopen', quantity: 15, price: 29.75 },
  { id: 't10', date: '2026-07-02', ticker: 'ASML', type: 'Verkopen', quantity: 1, price: 760 },
  { id: 't11', date: '2026-08-03', ticker: 'ING', type: 'Verkopen', quantity: 20, price: 17.1 },
  { id: 't12', date: '2026-08-20', ticker: 'ADYEN', type: 'Kopen', quantity: 1, price: 1580 },
  { id: 't13', date: '2026-09-05', ticker: 'PROSUS', type: 'Kopen', quantity: 10, price: 37.4 },
];
