import { Stock, StockPosition, Transaction } from '../data/types.ts';

// Excel in Nederland verwacht ; als scheidingsteken en een komma als decimaalteken.
const num = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',');
const cell = (v: string | number) => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function download(filename: string, rows: (string | number)[][]) {
  const text = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

export function exportPositionsCsv(positions: StockPosition[]) {
  download(`beleggingen-posities-${today()}.csv`, [
    ['Ticker', 'Naam', 'Aantal', 'Gem. aankoopkoers', 'Koers nu', 'Ingelegd', 'Waarde', 'Resultaat (euro)', 'Resultaat (%)', 'Deel van portefeuille (%)'],
    ...positions.map((p) => [
      p.stock.ticker,
      p.stock.name,
      num(p.sharesHeld, 4).replace(/,?0+$/, ''),
      num(p.avgBuyPrice),
      num(p.stock.currentPrice),
      num(p.invested),
      num(p.currentValue),
      num(p.profitLoss),
      num(p.profitLossPct * 100, 1),
      num(p.allocation * 100, 1),
    ]),
  ]);
}

export function exportTransactionsCsv(transactions: Transaction[], stocks: Stock[]) {
  const names = new Map(stocks.map((s) => [s.ticker, s.name]));
  download(`beleggingen-transacties-${today()}.csv`, [
    ['Datum', 'Ticker', 'Naam', 'Type', 'Aantal', 'Prijs per stuk', 'Totaal'],
    ...[...transactions]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [t.date, t.ticker, names.get(t.ticker) ?? '', t.type, num(t.quantity, 4).replace(/,?0+$/, ''), num(t.price), num(t.quantity * t.price)]),
  ]);
}

/** Opent het printvenster (daar kies je "Opslaan als pdf"). Altijd in licht thema, ook als je donker gebruikt. */
export function printPage() {
  const root = document.documentElement;
  const previous = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light');
  const restore = () => {
    if (previous === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', previous);
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
