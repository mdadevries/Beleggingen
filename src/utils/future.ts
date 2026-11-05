/**
 * Toekomstmachine: duizenden mogelijke toekomsten voor je portefeuille (Monte Carlo).
 * Elke maand een willekeurig rendement rond het gekozen gemiddelde, met de gekozen schommeling.
 * De uitkomst is geen voorspelling, maar een waaier: zo ziet "waarschijnlijk ergens hiertussen" eruit.
 */

export interface FutureInput {
  start: number;
  monthly: number;
  /** Jaarlijkse verhoging van je maandinleg (0.02 = 2% per jaar erbij) */
  monthlyGrowth: number;
  years: number;
  /** Verwacht gemiddeld rendement per jaar (0.07 = 7%) */
  expected: number;
  /** Schommeling per jaar (standaarddeviatie, 0.16 = 16%) */
  volatility: number;
  /** Inflatie per jaar; uitkomsten worden teruggerekend naar euro's van nu */
  inflation: number;
  paths?: number;
}

export interface FutureYear {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  contributed: number;
}

export interface FutureResult {
  years: FutureYear[];
  /** Per pad de eindwaarde (gesorteerd), voor kansberekeningen */
  finals: number[];
  /** Waarde per jaar per pad, om te bepalen wanneer een doel gehaald wordt */
  reachYear: (target: number) => { median: number | null; chance: number };
}

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

const q = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

export function simulateFuture(inp: FutureInput): FutureResult {
  const P = inp.paths ?? 1500;
  const months = Math.max(1, Math.round(inp.years * 12));
  const r = rng(20261105);
  // Lognormaal: gemiddeld rendement per maand zodat het verwachte jaarrendement klopt.
  const sm = inp.volatility / Math.sqrt(12);
  const mm = Math.log(1 + inp.expected) / 12 - (sm * sm) / 2;
  const infl = Math.pow(1 + inp.inflation, 1 / 12);
  const thisYear = new Date().getFullYear();

  const perYear: number[][] = Array.from({ length: Math.ceil(months / 12) + 1 }, () => new Array(P));
  const contributedPerYear: number[] = [];
  let spare: number | null = null;
  const gauss = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = Math.max(1e-12, r());
    const v = r();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };

  for (let p = 0; p < P; p++) {
    let value = inp.start;
    let deflator = 1;
    let contrib = inp.start;
    perYear[0][p] = value;
    if (p === 0) contributedPerYear[0] = inp.start;
    for (let m = 1; m <= months; m++) {
      value *= Math.exp(mm + sm * gauss());
      const monthly = inp.monthly * Math.pow(1 + inp.monthlyGrowth, Math.floor((m - 1) / 12));
      value += monthly;
      deflator *= infl;
      if (p === 0) contrib += monthly / deflator;
      if (m % 12 === 0 || m === months) {
        const y = Math.ceil(m / 12);
        perYear[y][p] = value / deflator;
        if (p === 0) contributedPerYear[y] = contrib;
      }
    }
  }

  const years: FutureYear[] = perYear.map((vals, y) => {
    const s = [...vals].sort((a, b) => a - b);
    return {
      year: thisYear + y,
      p10: q(s, 0.1),
      p25: q(s, 0.25),
      p50: q(s, 0.5),
      p75: q(s, 0.75),
      p90: q(s, 0.9),
      contributed: contributedPerYear[y] ?? 0,
    };
  });

  const finals = [...perYear[perYear.length - 1]].sort((a, b) => a - b);

  const reachYear = (target: number) => {
    const hitYears: number[] = [];
    for (let p = 0; p < P; p++) {
      for (let y = 0; y < perYear.length; y++) {
        if (perYear[y][p] >= target) {
          hitYears.push(y);
          break;
        }
      }
    }
    const chance = hitYears.length / P;
    hitYears.sort((a, b) => a - b);
    // Mediaanjaar: het jaar waarin de helft van alle toekomsten het doel gehaald heeft.
    const median = hitYears.length > Math.floor(P / 2) ? thisYear + hitYears[Math.floor(P / 2)] : null;
    return { median, chance };
  };

  return { years, finals, reachYear };
}
