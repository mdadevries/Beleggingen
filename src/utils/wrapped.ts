import { SeriesPoint, Stock, StockPosition, Transaction } from '../data/types.ts';
import { Points, simulateSameCashflows } from './history.ts';
import { computeExposure, investorType } from './analysis.ts';
import { shortName } from './names.ts';

export interface WrappedData {
  label: string;
  txCount: number;
  buys: number;
  sells: number;
  invested: number;
  busiestMonth: { name: string; count: number } | null;
  favoriteWeekday: string | null;
  newStocks: string[];
  best: { name: string; ticker: string; pct: number } | null;
  worst: { name: string; ticker: string; pct: number } | null;
  bestBuy: { name: string; ticker: string; date: string; price: number; pct: number } | null;
  loyal: { name: string; ticker: string; count: number } | null;
  vsMarket: { label: string; mine: number; theirs: number } | null;
  peakDay: { date: string; value: number } | null;
  type: { title: string; emoji: string; text: string };
  positions: number;
}

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const WEEKDAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

/** Alles voor je "Wrapped": je beleggingsjaar in leuke, deelbare weetjes. */
export function computeWrapped(
  year: number | 'alles',
  stocks: Stock[],
  transactions: Transaction[],
  positions: StockPosition[],
  series: SeriesPoint[],
  benchmarks: Record<string, Points>
): WrappedData {
  const inYear = (d: string) => year === 'alles' || d.startsWith(String(year));
  const txs = transactions.filter((t) => inYear(t.date));
  const nameOf = (ticker: string) => shortName(stocks.find((s) => s.ticker === ticker)?.name ?? ticker);

  const buys = txs.filter((t) => t.type === 'Kopen');
  const sells = txs.filter((t) => t.type === 'Verkopen');
  const invested = buys.reduce((s, t) => s + t.quantity * t.price, 0);

  const byMonth = new Map<number, number>();
  const byWeekday = new Map<number, number>();
  for (const t of txs) {
    const d = new Date(t.date + 'T12:00:00Z');
    byMonth.set(d.getUTCMonth(), (byMonth.get(d.getUTCMonth()) ?? 0) + 1);
    byWeekday.set(d.getUTCDay(), (byWeekday.get(d.getUTCDay()) ?? 0) + 1);
  }
  const topMonth = [...byMonth].sort((a, b) => b[1] - a[1])[0];
  const topDay = [...byWeekday].sort((a, b) => b[1] - a[1])[0];

  // Nieuwe aandelen: eerste aankoop valt in deze periode.
  const firstBuy = new Map<string, string>();
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) if (t.type === 'Kopen' && !firstBuy.has(t.ticker)) firstBuy.set(t.ticker, t.date);
  const newStocks = [...firstBuy].filter(([, d]) => inYear(d)).map(([t]) => nameOf(t));

  const ranked = positions.filter((p) => p.invested > 0).sort((a, b) => b.profitLossPct - a.profitLossPct);
  const best = ranked[0] ? { name: shortName(ranked[0].stock.name), ticker: ranked[0].stock.ticker, pct: ranked[0].profitLossPct } : null;
  const w = ranked[ranked.length - 1];
  const worst = ranked.length > 1 && w ? { name: shortName(w.stock.name), ticker: w.stock.ticker, pct: w.profitLossPct } : null;

  // Beste timing: welke losse aankoop staat er nu het best voor?
  let bestBuy: WrappedData['bestBuy'] = null;
  for (const t of buys) {
    const now = stocks.find((s) => s.ticker === t.ticker)?.currentPrice;
    if (!now || t.price <= 0) continue;
    const pct = now / t.price - 1;
    if (!bestBuy || pct > bestBuy.pct) bestBuy = { name: nameOf(t.ticker), ticker: t.ticker, date: t.date, price: t.price, pct };
  }

  const counts = new Map<string, number>();
  for (const t of buys) counts.set(t.ticker, (counts.get(t.ticker) ?? 0) + 1);
  const loyalTop = [...counts].sort((a, b) => b[1] - a[1])[0];
  const loyal = loyalTop && loyalTop[1] > 1 ? { name: nameOf(loyalTop[0]), ticker: loyalTop[0], count: loyalTop[1] } : null;

  // Jij vs de S&P 500, over je eigen geldstromen in deze periode.
  let vsMarket: WrappedData['vsMarket'] = null;
  const sp = benchmarks.sp500;
  const periodSeries = series.filter((p) => inYear(p.date));
  if (sp && periodSeries.length > 2) {
    const days = series.map((p) => p.date);
    const alt = simulateSameCashflows(transactions, sp, days);
    const iStart = series.findIndex((p) => inYear(p.date));
    const iEnd = series.length - 1 - [...series].reverse().findIndex((p) => inYear(p.date));
    const flowsIn = transactions.filter((t) => t.date <= series[iEnd].date && (iStart === 0 || t.date > series[iStart - 1].date));
    const inflow = flowsIn.filter((t) => t.type === 'Kopen').reduce((s, t) => s + t.quantity * t.price, 0);
    const outflow = flowsIn.filter((t) => t.type === 'Verkopen').reduce((s, t) => s + t.quantity * t.price, 0);
    const startMine = iStart > 0 ? series[iStart - 1].total : 0;
    const startAlt = iStart > 0 ? alt[iStart - 1] : 0;
    const base = startMine + inflow;
    const baseAlt = startAlt + inflow;
    if (base > 0 && baseAlt > 0) {
      vsMarket = {
        label: 'S&P 500',
        mine: (series[iEnd].total + outflow) / base - 1,
        theirs: (alt[iEnd] + outflow) / baseAlt - 1,
      };
    }
  }

  const peak = periodSeries.reduce<SeriesPoint | null>((m, p) => (!m || p.total > m.total ? p : m), null);
  const ds = transactions.map((t) => t.date).sort();
  const months = ds.length > 1 ? Math.max(1, (Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / (30.4 * 86_400_000)) : 1;

  return {
    label: year === 'alles' ? 'Alles tot nu toe' : String(year),
    txCount: txs.length,
    buys: buys.length,
    sells: sells.length,
    invested,
    busiestMonth: topMonth ? { name: MONTHS[topMonth[0]], count: topMonth[1] } : null,
    favoriteWeekday: topDay ? WEEKDAYS[topDay[0]] : null,
    newStocks,
    best,
    worst,
    bestBuy,
    loyal,
    vsMarket,
    peakDay: peak ? { date: peak.date, value: peak.total } : null,
    type: investorType(computeExposure(positions), transactions.length, months),
    positions: positions.length,
  };
}
