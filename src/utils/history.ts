import { SeriesPoint, Stock, Transaction } from '../data/types.ts';

/** Dagkoersen in euro's: [datum (yyyy-mm-dd), koers]. Altijd oplopend op datum. */
export type Points = [string, number][];

const DAY_MS = 86_400_000;
const toT = (d: string) => Date.parse(d + 'T00:00:00Z');
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Koers op een dag: de laatste bekende koers op of vóór die dag (weekend/vakantie = vorige slotkoers). */
export function priceOn(points: Points | undefined, date: string): number | null {
  if (!points || points.length === 0) return null;
  if (date < points[0][0]) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return points[lo][1];
}

/** Zelfde, maar vóór het eerste punt nemen we het eerste punt (handig als je net vóór de reeks kocht). */
export function priceOnOrFirst(points: Points | undefined, date: string): number | null {
  if (!points || points.length === 0) return null;
  return priceOn(points, date) ?? points[0][1];
}

/**
 * Het échte waardeverloop: per beursdag het aantal stuks dat je toen had × de echte slotkoers.
 * Voor een aandeel zonder koershistorie vallen we terug op een rechte lijn tussen jouw
 * transactieprijzen en de huidige koers (zoals het oude, geschatte verloop).
 * `coverage` = welk deel van de waarde (vandaag) op echte koersen rust.
 */
export function computeRealSeries(
  stocks: Stock[],
  transactions: Transaction[],
  histories: Record<string, Points>
): { series: SeriesPoint[]; coverage: number } {
  if (transactions.length === 0) return { series: [], coverage: 0 };
  const txs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const start = txs[0].date;
  const end = todayIso() > txs[txs.length - 1].date ? todayIso() : txs[txs.length - 1].date;

  // Alle beursdagen uit alle reeksen, vanaf je eerste aankoop.
  const daySet = new Set<string>([start, end]);
  for (const t of txs) daySet.add(t.date);
  for (const pts of Object.values(histories)) for (const [d] of pts) if (d >= start && d <= end) daySet.add(d);
  let days = [...daySet].sort();
  // Hooguit ~420 punten: genoeg voor een vloeiende lijn, licht voor de telefoon.
  if (days.length > 420) {
    const keep = new Set(txs.map((t) => t.date));
    const step = days.length / 400;
    days = days.filter((d, i) => keep.has(d) || i === days.length - 1 || Math.floor(i / step) !== Math.floor((i - 1) / step));
  }

  // Terugval per aandeel: rechte lijn tussen transactieprijzen en de huidige koers.
  const anchors = new Map<string, [number, number][]>();
  for (const s of stocks) {
    const list: [number, number][] = [];
    for (const tx of txs) if (tx.ticker === s.ticker) list.push([toT(tx.date), tx.price]);
    if (list.length) list.push([toT(end), s.currentPrice]);
    anchors.set(s.ticker, list);
  }
  const lerp = (ticker: string, t: number) => {
    const a = anchors.get(ticker);
    if (!a || a.length === 0) return 0;
    if (t <= a[0][0]) return a[0][1];
    for (let i = 1; i < a.length; i++) {
      if (t <= a[i][0]) {
        const [t0, p0] = a[i - 1];
        const [t1, p1] = a[i];
        return t1 === t0 ? p1 : p0 + ((p1 - p0) * (t - t0)) / (t1 - t0);
      }
    }
    return a[a.length - 1][1];
  };

  // Stuks en kostenbasis per aandeel lopen we in één keer door (transacties zijn gesorteerd).
  const shares: Record<string, number> = {};
  const cost: Record<string, number> = {};
  let ti = 0;
  const out: SeriesPoint[] = [];
  let realToday = 0;
  let totalToday = 0;

  for (const d of days) {
    while (ti < txs.length && txs[ti].date <= d) {
      const tx = txs[ti++];
      const sh = shares[tx.ticker] ?? 0;
      const c = cost[tx.ticker] ?? 0;
      if (tx.type === 'Kopen') {
        shares[tx.ticker] = sh + tx.quantity;
        cost[tx.ticker] = c + tx.quantity * tx.price;
      } else {
        const avg = sh > 0 ? c / sh : 0;
        const left = Math.max(0, sh - tx.quantity);
        shares[tx.ticker] = left;
        cost[tx.ticker] = left > 1e-9 ? left * avg : 0;
      }
    }
    const t = toT(d);
    const values: Record<string, number> = {};
    let total = 0;
    let c = 0;
    const isLast = d === days[days.length - 1];
    for (const s of stocks) {
      const sh = shares[s.ticker] ?? 0;
      c += cost[s.ticker] ?? 0;
      if (sh <= 1e-9) {
        values[s.ticker] = 0;
        continue;
      }
      // Vandaag altijd de huidige (live) koers, zodat het verloop eindigt waar de kerncijfers staan.
      const hp = isLast ? s.currentPrice : priceOn(histories[s.ticker], d);
      const p = hp ?? lerp(s.ticker, t);
      const v = sh * p;
      values[s.ticker] = v;
      total += v;
      if (isLast) {
        totalToday += v;
        if (histories[s.ticker]?.length) realToday += v;
      }
    }
    out.push({ date: d, t, values, total, cost: c });
  }
  return { series: out, coverage: totalToday > 0 ? realToday / totalToday : 0 };
}

/**
 * "Wat als ik elke euro in X had gestopt?" Elke aankoop koopt voor hetzelfde bedrag X,
 * elke verkoop verkoopt voor hetzelfde bedrag X. Zo heb je exact dezelfde geldstromen
 * als in het echt, en kun je de waarde eerlijk vergelijken.
 */
export function simulateSameCashflows(transactions: Transaction[], points: Points, days: string[]): number[] {
  const txs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let units = 0;
  let ti = 0;
  return days.map((d) => {
    while (ti < txs.length && txs[ti].date <= d) {
      const tx = txs[ti++];
      const p = priceOnOrFirst(points, tx.date);
      if (!p) continue;
      const euros = tx.quantity * tx.price;
      units = tx.type === 'Kopen' ? units + euros / p : Math.max(0, units - euros / p);
    }
    const p = priceOnOrFirst(points, d) ?? 0;
    return units * p;
  });
}

/** Rendement over je eigen geldstromen: (huidige waarde + wat je eruit haalde) / wat je erin stopte − 1. */
export function cashflowReturn(transactions: Transaction[], valueNow: number): number | null {
  let inflow = 0;
  let outflow = 0;
  for (const t of transactions) {
    if (t.type === 'Kopen') inflow += t.quantity * t.price;
    else outflow += t.quantity * t.price;
  }
  return inflow > 0 ? (valueNow + outflow) / inflow - 1 : null;
}

/** Duel: wat als je bij dit aandeel steeds de concurrent had gekocht (zelfde bedragen, zelfde dagen)? */
export function peerDuel(
  txs: Transaction[],
  currentPrice: number,
  peer: Points
): { mine: number; theirs: number; mineValue: number; theirsValue: number; invested: number } | null {
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0 || peer.length < 2) return null;
  let myShares = 0;
  let peerUnits = 0;
  let inflow = 0;
  let outMine = 0;
  let outPeer = 0;
  for (const t of sorted) {
    const pp = priceOnOrFirst(peer, t.date);
    if (!pp) return null;
    if (t.type === 'Kopen') {
      myShares += t.quantity;
      inflow += t.quantity * t.price;
      peerUnits += (t.quantity * t.price) / pp;
    } else {
      // Zelfde deel van je positie verkopen bij de concurrent.
      const frac = myShares > 0 ? Math.min(1, t.quantity / myShares) : 1;
      outMine += t.quantity * t.price;
      outPeer += peerUnits * frac * pp;
      peerUnits -= peerUnits * frac;
      myShares -= t.quantity;
    }
  }
  if (inflow <= 0) return null;
  const peerNow = peer[peer.length - 1][1];
  const mineValue = Math.max(0, myShares) * currentPrice + outMine;
  const theirsValue = peerUnits * peerNow + outPeer;
  return { mine: mineValue / inflow - 1, theirs: theirsValue / inflow - 1, mineValue, theirsValue, invested: inflow };
}

/**
 * Tijd-gewogen index (start 100): haalt het effect van bijkopen en verkopen eruit, zodat je alleen
 * ziet hoe de beleggingen zelf bewogen. Nodig voor een eerlijke "grootste dip" en schommeling.
 */
export function timeWeightedIndex(values: number[], days: string[], transactions: Transaction[]): number[] {
  const flow = new Map<string, number>();
  for (const t of transactions) flow.set(t.date, (flow.get(t.date) ?? 0) + (t.type === 'Kopen' ? 1 : -1) * t.quantity * t.price);
  // Dagen kunnen overgeslagen zijn bij het uitdunnen: tel de geldstromen tussen twee punten samen.
  const flowDates = [...flow.keys()].sort();
  const out: number[] = [];
  let idx = 100;
  let fi = 0;
  for (let i = 0; i < values.length; i++) {
    let f = 0;
    while (fi < flowDates.length && flowDates[fi] <= days[i]) f += flow.get(flowDates[fi++])!;
    if (i > 0 && values[i - 1] > 1e-6) {
      const r = (values[i] - f) / values[i - 1];
      if (Number.isFinite(r) && r > 0) idx *= r;
    }
    out.push(idx);
  }
  return out;
}

/** Jaarlijkse schommeling (volatiliteit) uit een reeks waarden, op basis van dagrendementen. */
export function annualVolatility(values: number[], days?: string[]): number | null {
  const r: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0 && values[i] > 0) r.push(Math.log(values[i] / values[i - 1]));
  }
  if (r.length < 30) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  // Punten per jaar: bij dagkoersen ~252, bij een uitgedunde reeks minder.
  let perYear = 252;
  if (days && days.length > 2) {
    const span = (toT(days[days.length - 1]) - toT(days[0])) / (365 * DAY_MS);
    if (span > 0.05) perYear = Math.min(252, (days.length - 1) / span);
  }
  return Math.sqrt(v * perYear);
}

/** Grootste daling van top naar dal, als fractie (0.2 = −20%). */
export function maxDrawdown(values: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}

/** Een reeks op dagen terugbrengen naar een gelijk aantal punten (voor kleine sparklines). */
export function sampleValues(points: Points, from: string, n = 40): number[] {
  const p = points.filter(([d]) => d >= from);
  if (p.length <= n) return p.map(([, v]) => v);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(p[Math.round((i * (p.length - 1)) / (n - 1))][1]);
  return out;
}

export const daysBetween = (a: string, b: string) => Math.round((toT(b) - toT(a)) / DAY_MS);
