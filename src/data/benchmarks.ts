/**
 * De indexen waartegen je racet. We gebruiken de koers van een grote, goedkope ETF die de index
 * volgt (in euro's, via justETF op ISIN). Allemaal "accumulerend": het dividend zit in de koers,
 * dus het is een eerlijke vergelijking met wat je echt had kunnen kopen.
 */
export interface Benchmark {
  id: 'sp500' | 'nasdaq' | 'world' | 'europe';
  label: string;
  short: string;
  etf: string;
  isin: string;
  color: string;
  emoji: string;
}

export const BENCHMARKS: Benchmark[] = [
  { id: 'sp500', label: 'S&P 500', short: 'S&P 500', etf: 'iShares Core S&P 500 (Acc)', isin: 'IE00B5BMR087', color: '#eb6834', emoji: '🇺🇸' },
  { id: 'nasdaq', label: 'Nasdaq-100', short: 'Nasdaq', etf: 'iShares Nasdaq 100 (Acc)', isin: 'IE00B53SZB19', color: '#8b5cf6', emoji: '🚀' },
  { id: 'world', label: 'MSCI World', short: 'Wereld', etf: 'iShares Core MSCI World (Acc)', isin: 'IE00B4L5Y983', color: '#1baf7a', emoji: '🌍' },
  { id: 'europe', label: 'MSCI Europe', short: 'Europa', etf: 'iShares Core MSCI Europe (Acc)', isin: 'IE00B4K48X80', color: '#eda100', emoji: '🇪🇺' },
];

export const MY_COLOR = '#2a78d6';
