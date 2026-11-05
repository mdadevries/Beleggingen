import { Points } from '../utils/history.ts';
import { DEMO_STOCKS, DEMO_TRANSACTIONS } from './demoData.ts';

/**
 * Verzonnen koershistorie voor de demo: een willekeurige (maar elke keer dezelfde) koerslijn
 * die precies door de demo-transactieprijzen en de demo-koers van vandaag loopt. Zo werken de
 * echte grafiek, de race en de duels ook in de demo, zonder ooit echte data aan te raken.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Werkdagen (ma-vr) tussen twee data. */
function businessDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86_400_000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const START = '2025-06-02';

function path(id: string, days: string[], anchors: [string, number][], dailyVol: number): Points {
  const r = rng(hash(id));
  const w: number[] = [0];
  for (let i = 1; i < days.length; i++) w.push(w[i - 1] + gauss(r) * dailyVol);
  // Ankers op de eerste werkdag op of na hun datum.
  const idx = anchors
    .map(([d, p]) => {
      let k = days.findIndex((x) => x >= d);
      if (k < 0) k = days.length - 1;
      return [k, Math.log(p)] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
  const logs = days.map((_, k) => {
    if (k <= idx[0][0]) return idx[0][1] + (w[k] - w[idx[0][0]]);
    for (let j = 1; j < idx.length; j++) {
      const [k0, l0] = idx[j - 1];
      const [k1, l1] = idx[j];
      if (k <= k1) {
        const f = k1 === k0 ? 1 : (k - k0) / (k1 - k0);
        return l0 + (l1 - l0) * f + (w[k] - (w[k0] + (w[k1] - w[k0]) * f));
      }
    }
    const [kl, ll] = idx[idx.length - 1];
    return ll + (w[k] - w[kl]);
  });
  return days.map((d, k) => [d, Math.round(Math.exp(logs[k]) * 100) / 100]);
}

/** Een lijn met een vaste groei per jaar, voor indexen en concurrenten. */
function trend(id: string, days: string[], start: number, yearly: number, dailyVol: number): Points {
  const n = days.length;
  const endLog = Math.log(start) + Math.log(1 + yearly) * (n / 252);
  return path(id, days, [[days[0], start], [days[n - 1], Math.exp(endLog)]], dailyVol);
}

let cache: { histories: Record<string, Points>; benchmarks: Record<string, Points>; peers: Record<string, Points> } | null = null;

export function demoHistory() {
  if (cache) return cache;
  const today = new Date().toISOString().slice(0, 10);
  const days = businessDays(START, today);
  const histories: Record<string, Points> = {};
  for (const s of DEMO_STOCKS) {
    const anchors: [string, number][] = DEMO_TRANSACTIONS.filter((t) => t.ticker === s.ticker).map((t) => [t.date, t.price]);
    anchors.push([today, s.currentPrice]);
    const vol = /VANGUA/.test(s.ticker) ? 0.008 : /ADYEN|PROSUS/.test(s.ticker) ? 0.02 : 0.015;
    histories[s.ticker] = path(s.ticker, days, anchors, vol);
  }
  const benchmarks: Record<string, Points> = {
    sp500: trend('sp500', days, 520, 0.13, 0.009),
    nasdaq: trend('nasdaq', days, 1050, 0.17, 0.012),
    world: trend('world', days, 98, 0.11, 0.008),
    europe: trend('europe', days, 82, 0.07, 0.008),
  };
  const peers: Record<string, Points> = {
    AMAT: trend('AMAT', days, 160, 0.05, 0.02),
    BP: trend('BP', days, 28, 0.02, 0.014),
    PYPL: trend('PYPL', days, 62, -0.06, 0.018),
    IE00B4L5Y983: benchmarks.world,
  };
  cache = { histories, benchmarks, peers };
  return cache;
}
