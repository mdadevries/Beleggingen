/**
 * Rekent je DUO-studieschuld vooruit, maand voor maand, volgens de regels voor
 * studenten die na 2015 zijn begonnen (SF35). Bron: duo.nl (oktober 2026).
 *
 * - Rente wordt elke maand berekend over je hele schuld, inclusief eerder bijgeschreven
 *   rente (samengestelde rente). Wij rekenen met jaarrente / 12 per maand.
 * - Tijdens je studie staat de rente steeds 1 jaar vast.
 * - Stopt je studiefinanciering, dan begint op 1 januari daarna de aanloopfase van 2 jaar
 *   (nog niets terugbetalen, wel rente). Vanaf de aanloopfase staat de rente 5 jaar vast,
 *   daarna steeds een nieuwe periode van 5 jaar.
 * - Daarna 35 jaar terugbetalen. DUO rekent een "wettelijk maandbedrag" uit: het bedrag
 *   waarmee de schuld precies in de resterende tijd is afgelost. Dat wordt opnieuw berekend
 *   als de rente verandert.
 * - Draagkracht: je betaalt nooit meer dan 4% van je inkomen boven de vrijstelling.
 * - Wat er na 35 jaar nog over is, wordt kwijtgescholden.
 *
 * Dit is een schatting: DUO rekent zelf in Mijn DUO met jouw echte gegevens.
 */

/** Vastgestelde SF35-rentes (fractie). Daarna rekenen we met een aanname. */
export const KNOWN_RATES: Record<number, number> = {
  2025: 0.0257,
  2026: 0.0233,
  2027: 0.027,
};

/** Vrijstelling voor draagkracht (alleenstaand, zonder kinderen), 2026, per jaar. */
export const DRAAGKRACHT_VRIJSTELLING = 26819.42;
export const DRAAGKRACHT_PCT = 0.04;
export const AFLOS_MAANDEN = 35 * 12;
export const MAX_LENING_PER_MAAND = 1213.95;

export interface LoanSettings {
  /** Je schuld nu volgens Mijn DUO, inclusief rente */
  debtNow: number;
  /** Maand waarop die schuld klopt, 'YYYY-MM' */
  asOf: string;
  /** Wat je elke maand leent */
  monthlyLoan: number;
  /** Wat je elke maand krijgt maar geen lening is (basisbeurs, wordt een gift met diploma) */
  monthlyGrant: number;
  /** Einde van je bachelor, 'YYYY-MM' (voor de keuzeknoppen) */
  bachelorEnd: string;
  /** Laatste maand dat je leent, 'YYYY-MM' */
  lastLoanMonth: string;
  /** Je leeftijd nu */
  ageNow: number;
  /** Aanname voor de rente na de bekende jaren (fractie) */
  rateLater: number;
  /** Extra aflossen per maand bovenop het DUO-bedrag */
  extraPerMonth: number;
  /** Verwacht bruto jaarinkomen voor de draagkracht; 0 = niet meerekenen */
  salary: number;
  /** Totale waarde op DEGIRO, inclusief vrije ruimte */
  degiroTotal: number;
  /** Vrije ruimte (niet belegd geld) op DEGIRO */
  degiroCash: number;
}

export type Phase = 'studie' | 'aanloop' | 'aflossen' | 'klaar';

export interface MonthPoint {
  /** 'YYYY-MM' */
  ym: string;
  /** Jaar als kommagetal, voor de grafiek */
  t: number;
  balance: number;
  phase: Phase;
}

export interface YearRow {
  year: number;
  age: number;
  phase: Phase;
  borrowed: number;
  interest: number;
  paid: number;
  /** Kwijtgescholden in dat jaar (alleen in het laatste jaar van de 35 jaar) */
  forgiven: number;
  balanceEnd: number;
  /** Rente die in dat jaar gold (fractie, van de laatste maand) */
  rate: number;
}

export interface LoanProjection {
  months: MonthPoint[];
  years: YearRow[];
  stopYm: string;
  aanloopStartYm: string;
  aflosStartYm: string;
  aflosEndYm: string;
  debtAtStop: number;
  debtAtAflosStart: number;
  /** Eerste wettelijk maandbedrag (zonder extra, zonder draagkracht) */
  legalMonthly: number;
  /** Wat je in het eerste aflosjaar echt per maand betaalt (draagkracht + extra meegerekend) */
  firstPayment: number;
  /** Maximaal per maand volgens draagkracht, of null als er geen inkomen is ingevuld */
  draagkrachtMonthly: number | null;
  totalBorrowedFromNow: number;
  totalInterest: number;
  totalPaid: number;
  forgiven: number;
  /** Maand waarin de schuld op 0 staat, of null als die wordt kwijtgescholden */
  paidOffYm: string | null;
  /** Rente die geldt bij de start van de aanloopfase (5 jaar vast) */
  aanloopRate: number;
}

// ---------- maanden ----------

export function ymParse(ym: string): { y: number; m: number } {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}
export function ymFormat(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function ymAdd(ym: string, n: number): string {
  const { y, m } = ymParse(ym);
  const idx = y * 12 + (m - 1) + n;
  return ymFormat(Math.floor(idx / 12), (idx % 12) + 1);
}
export function ymDiff(a: string, b: string): number {
  const pa = ymParse(a);
  const pb = ymParse(b);
  return pb.y * 12 + pb.m - (pa.y * 12 + pa.m);
}
export function isYm(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function rateForYear(year: number, rateLater: number): number {
  return KNOWN_RATES[year] ?? rateLater;
}

/** Maandbedrag waarmee `balance` in `n` maanden precies is afgelost (annuïteit). */
export function annuity(balance: number, monthlyRate: number, n: number): number {
  if (n <= 0) return balance;
  if (monthlyRate <= 0) return balance / n;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

export function projectLoan(s: LoanSettings): LoanProjection {
  const stopYm = s.lastLoanMonth < s.asOf ? s.asOf : s.lastLoanMonth;
  const stopYear = ymParse(stopYm).y;
  const aanloopStartYm = ymFormat(stopYear + 1, 1);
  const aflosStartYm = ymFormat(stopYear + 3, 1);
  const aflosEndYm = ymAdd(aflosStartYm, AFLOS_MAANDEN - 1);
  const aanloopYear = stopYear + 1;

  const draagkrachtMonthly =
    s.salary > 0 ? Math.max(0, (DRAAGKRACHT_PCT * (s.salary - DRAAGKRACHT_VRIJSTELLING)) / 12) : null;

  /** Jaarrente in een bepaalde maand. */
  const annualRate = (ym: string): number => {
    const { y } = ymParse(ym);
    if (ym < aanloopStartYm) return rateForYear(y, s.rateLater);
    // Vanaf de aanloopfase: blokken van 5 jaar, rente van het startjaar van het blok.
    const block = Math.floor((y - aanloopYear) / 5);
    return rateForYear(aanloopYear + block * 5, s.rateLater);
  };

  let balance = Math.max(0, s.debtNow);
  const months: MonthPoint[] = [];
  const yearMap = new Map<number, YearRow>();
  const ageAt = (y: number) => s.ageNow + (y - ymParse(s.asOf).y);
  const row = (y: number, phase: Phase): YearRow => {
    let r = yearMap.get(y);
    if (!r) {
      r = { year: y, age: ageAt(y), phase, borrowed: 0, interest: 0, paid: 0, forgiven: 0, balanceEnd: 0, rate: 0 };
      yearMap.set(y, r);
    }
    r.phase = phase; // de fase van de laatste maand in het jaar telt
    return r;
  };

  const start = ymParse(s.asOf);
  months.push({ ym: s.asOf, t: start.y + (start.m - 1) / 12, balance, phase: 'studie' });

  let totalBorrowed = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  let forgiven = 0;
  let debtAtStop = balance;
  let debtAtAflosStart = balance;
  let legalMonthly = 0;
  let firstPayment = 0;
  let currentLegal = 0;
  let lastRate = -1;
  let paidOffYm: string | null = null;

  for (let ym = ymAdd(s.asOf, 1); ym <= aflosEndYm; ym = ymAdd(ym, 1)) {
    const { y, m } = ymParse(ym);
    const phase: Phase = ym <= stopYm ? 'studie' : ym < aflosStartYm ? 'aanloop' : 'aflossen';
    const rate = annualRate(ym);
    const r = row(y, phase);
    r.rate = rate;

    // 1. Rente over de hele schuld (ook over eerder bijgeschreven rente).
    const interest = balance * (rate / 12);
    balance += interest;
    r.interest += interest;
    totalInterest += interest;

    // 2. Nieuwe lening tijdens de studie.
    if (phase === 'studie') {
      balance += s.monthlyLoan;
      r.borrowed += s.monthlyLoan;
      totalBorrowed += s.monthlyLoan;
      if (ym === stopYm) debtAtStop = balance;
    }

    // 3. Terugbetalen.
    if (phase === 'aflossen') {
      if (ym === aflosStartYm) debtAtAflosStart = balance - interest;
      const monthsLeft = ymDiff(ym, aflosEndYm) + 1;
      // DUO rekent het maandbedrag opnieuw uit als de rente verandert (nieuwe periode van 5 jaar).
      if (rate !== lastRate) {
        currentLegal = annuity(balance - interest, rate / 12, monthsLeft);
        lastRate = rate;
        if (ym === aflosStartYm) legalMonthly = currentLegal;
      }
      let pay = draagkrachtMonthly !== null ? Math.min(currentLegal, draagkrachtMonthly) : currentLegal;
      pay += s.extraPerMonth;
      pay = Math.min(pay, balance);
      if (ym === aflosStartYm) firstPayment = pay;
      balance -= pay;
      r.paid += pay;
      totalPaid += pay;
      if (balance < 0.005) {
        balance = 0;
        paidOffYm = ym;
      } else if (ym === aflosEndYm) {
        forgiven = balance;
        r.forgiven = balance;
        balance = 0;
      }
    }

    r.balanceEnd = balance;
    months.push({ ym, t: y + (m - 1) / 12, balance, phase: balance === 0 && phase === 'aflossen' ? 'klaar' : phase });
    if (balance === 0 && phase === 'aflossen') break;
  }

  return {
    months,
    years: [...yearMap.values()].sort((a, b) => a.year - b.year),
    stopYm,
    aanloopStartYm,
    aflosStartYm,
    aflosEndYm,
    debtAtStop,
    debtAtAflosStart,
    legalMonthly,
    firstPayment,
    draagkrachtMonthly,
    totalBorrowedFromNow: totalBorrowed,
    totalInterest,
    totalPaid,
    forgiven,
    paidOffYm,
    aanloopRate: annualRate(aanloopStartYm),
  };
}

/** Schuld aan het eind van een bepaalde maand (0 als die al voorbij het einde is). */
export function balanceAt(p: LoanProjection, ym: string): number {
  if (ym < p.months[0].ym) return p.months[0].balance;
  const hit = p.months.find((m) => m.ym === ym);
  return hit ? hit.balance : 0;
}
