import { Stock, StockPosition, Transaction, ValuePoint } from '../data/types.ts';

/**
 * Berekent per aandeel de huidige positie (stukken, gem. aankoopkoers,
 * ingelegd bedrag, waarde, winst/verlies) via de gemiddelde-kostenmethode:
 * elke verkoop verlaagt de kostenbasis met verkochte stukken × gem. koers,
 * de gemiddelde koers zelf verandert niet door een verkoop.
 */
export function computePositions(stocks: Stock[], transactions: Transaction[]): StockPosition[] {
  const positions: StockPosition[] = [];
  let totalValue = 0;

  const byStock = stocks.map((stock) => {
    const txs = transactions
      .filter((t) => t.ticker === stock.ticker)
      .sort((a, b) => a.date.localeCompare(b.date));

    let shares = 0;
    let totalCost = 0; // kostenbasis van de nog aangehouden stukken
    let avgBuyPrice = 0;

    for (const tx of txs) {
      if (tx.type === 'Kopen') {
        totalCost += tx.quantity * tx.price;
        shares += tx.quantity;
        avgBuyPrice = shares > 0 ? totalCost / shares : 0;
      } else {
        shares -= tx.quantity;
        totalCost = shares > 0 ? shares * avgBuyPrice : 0;
      }
    }

    const currentValue = shares * stock.currentPrice;
    totalValue += currentValue;

    return { stock, shares, avgBuyPrice, invested: totalCost, currentValue };
  });

  for (const p of byStock) {
    const profitLoss = p.currentValue - p.invested;
    positions.push({
      stock: p.stock,
      sharesHeld: p.shares,
      avgBuyPrice: p.avgBuyPrice,
      invested: p.invested,
      currentValue: p.currentValue,
      profitLoss,
      profitLossPct: p.invested > 0 ? profitLoss / p.invested : 0,
      allocation: totalValue > 0 ? p.currentValue / totalValue : 0,
    });
  }

  // Grootste positie eerst — logische volgorde voor de verdeling.
  return positions.filter((p) => p.sharesHeld > 0).sort((a, b) => b.currentValue - a.currentValue);
}

export interface PortfolioTotals {
  totalValue: number;
  totalInvested: number;
  totalProfitLoss: number;
  totalProfitLossPct: number;
  numberOfStocks: number;
}

export function computeTotals(positions: StockPosition[]): PortfolioTotals {
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
  const totalInvested = positions.reduce((sum, p) => sum + p.invested, 0);
  const totalProfitLoss = totalValue - totalInvested;
  return {
    totalValue,
    totalInvested,
    totalProfitLoss,
    totalProfitLossPct: totalInvested > 0 ? totalProfitLoss / totalInvested : 0,
    numberOfStocks: positions.length,
  };
}

/**
 * Benadert de portefeuillewaarde per maandultimo, door voor elke maand de op
 * dat moment aangehouden stukken te vermenigvuldigen met een koers die
 * lineair interpoleert tussen de eerste aankoopkoers en de huidige koers.
 * Bedoeld als illustratief verloop bij demodata, niet als exacte
 * koershistorie.
 */
export function computeValueOverTime(stocks: Stock[], transactions: Transaction[]): ValuePoint[] {
  if (transactions.length === 0) return [];

  const sortedTx = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sortedTx[0].date + 'T00:00:00');
  const lastDate = new Date(sortedTx[sortedTx.length - 1].date + 'T00:00:00');

  const firstBuyPriceByTicker = new Map<string, number>();
  for (const tx of sortedTx) {
    if (tx.type === 'Kopen' && !firstBuyPriceByTicker.has(tx.ticker)) {
      firstBuyPriceByTicker.set(tx.ticker, tx.price);
    }
  }

  const monthEnds: Date[] = [];
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const endCursor = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);
  while (cursor <= endCursor) {
    monthEnds.push(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  // Laatste punt = vandaag (huidige koers), niet noodzakelijk een maandultimo.
  const today = lastDate;
  if (monthEnds[monthEnds.length - 1]?.getTime() !== today.getTime()) {
    monthEnds.push(today);
  }

  const totalSpan = Math.max(1, today.getTime() - firstDate.getTime());

  return monthEnds.map((date) => {
    let value = 0;
    for (const stock of stocks) {
      const sharesAtDate = sortedTx
        .filter((t) => t.ticker === stock.ticker && new Date(t.date + 'T00:00:00') <= date)
        .reduce((sum, t) => sum + (t.type === 'Kopen' ? t.quantity : -t.quantity), 0);
      if (sharesAtDate <= 0) continue;

      const startPrice = firstBuyPriceByTicker.get(stock.ticker) ?? stock.currentPrice;
      const progress = Math.min(1, Math.max(0, (date.getTime() - firstDate.getTime()) / totalSpan));
      const interpolatedPrice = startPrice + (stock.currentPrice - startPrice) * progress;
      value += sharesAtDate * interpolatedPrice;
    }
    return { date: date.toISOString().slice(0, 10), value };
  });
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatEuroPrecise(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso + 'T00:00:00')
  );
}
