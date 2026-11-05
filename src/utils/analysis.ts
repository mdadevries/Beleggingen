import { StockPosition } from '../data/types.ts';
import { findProfile, isEtf } from '../data/stockProfiles.ts';

/**
 * Portefeuille-analyse. We kijken "door de ETF's heen": een wereld-ETF telt voor ~60-70%
 * als Amerika, ~13% als Europa, enzovoort. Die verdelingen zijn bewust afgerond (ze
 * schuiven elke maand een beetje) en staan hieronder vast in de code.
 */

export type Region = 'VS' | 'Europa' | 'Azië' | 'Opkomend' | 'Overig';
export type Sector =
  | 'Software & tech'
  | 'Chips'
  | 'Internet & consument'
  | 'Financieel & betalen'
  | 'Gezondheid'
  | 'Industrie & energie'
  | 'Crypto'
  | 'Overig';

export const REGIONS: Region[] = ['VS', 'Europa', 'Azië', 'Opkomend', 'Overig'];
export const SECTORS: Sector[] = [
  'Software & tech',
  'Chips',
  'Internet & consument',
  'Financieel & betalen',
  'Gezondheid',
  'Industrie & energie',
  'Crypto',
  'Overig',
];

type Mix<K extends string> = Partial<Record<K, number>>;
interface LookThrough {
  match: RegExp;
  label: string;
  regions: Mix<Region>;
  sectors: Mix<Sector>;
}

const BROAD_SECTORS: Mix<Sector> = {
  'Software & tech': 0.2,
  Chips: 0.08,
  'Internet & consument': 0.19,
  'Financieel & betalen': 0.16,
  Gezondheid: 0.1,
  'Industrie & energie': 0.15,
  Overig: 0.12,
};

// Volgorde telt: de eerste treffer wint (dus specifiek vóór algemeen).
const ETF_MIX: LookThrough[] = [
  {
    match: /s&p ?500.*(info|tech)|information tech/i,
    label: 'S&P 500 Tech',
    regions: { VS: 1 },
    sectors: { 'Software & tech': 0.58, Chips: 0.42 },
  },
  {
    match: /nasdaq/i,
    label: 'Nasdaq-100',
    regions: { VS: 0.97, Overig: 0.03 },
    sectors: { 'Software & tech': 0.36, Chips: 0.2, 'Internet & consument': 0.27, Gezondheid: 0.06, Overig: 0.11 },
  },
  {
    match: /semicon|chip/i,
    label: 'Chips',
    regions: { VS: 0.7, Azië: 0.2, Europa: 0.1 },
    sectors: { Chips: 1 },
  },
  {
    match: /emerging|opkomend|\bem\b/i,
    label: 'Opkomende markten',
    regions: { Opkomend: 1 },
    sectors: { 'Software & tech': 0.1, Chips: 0.14, 'Internet & consument': 0.22, 'Financieel & betalen': 0.23, 'Industrie & energie': 0.13, Overig: 0.18 },
  },
  {
    match: /msci europe|stoxx|europe/i,
    label: 'Europa',
    regions: { Europa: 1 },
    sectors: { 'Software & tech': 0.05, Chips: 0.03, 'Internet & consument': 0.16, 'Financieel & betalen': 0.22, Gezondheid: 0.14, 'Industrie & energie': 0.23, Overig: 0.17 },
  },
  {
    match: /all-?world|ftse|acwi/i,
    label: 'Hele wereld',
    regions: { VS: 0.63, Europa: 0.13, Azië: 0.07, Opkomend: 0.11, Overig: 0.06 },
    sectors: BROAD_SECTORS,
  },
  {
    match: /msci world|world/i,
    label: 'Ontwikkelde landen',
    regions: { VS: 0.72, Europa: 0.15, Azië: 0.07, Overig: 0.06 },
    sectors: BROAD_SECTORS,
  },
  {
    match: /s&p ?500|sp500/i,
    label: 'S&P 500',
    regions: { VS: 1 },
    sectors: { 'Software & tech': 0.24, Chips: 0.1, 'Internet & consument': 0.2, 'Financieel & betalen': 0.13, Gezondheid: 0.1, 'Industrie & energie': 0.11, Overig: 0.12 },
  },
];

const COUNTRY_REGION: [RegExp, Region][] = [
  [/verenigde staten|\bvs\b|usa|amerika/i, 'VS'],
  [/nederland|verenigd koninkrijk|denemarken|duitsland|frankrijk|zwitserland|zweden|spanje|itali|belgi|ierland|finland|noorwegen/i, 'Europa'],
  [/japan|taiwan|hongkong|korea|singapore|australi/i, 'Azië'],
  [/china|india|brazili|mexico|argentin|indonesi/i, 'Opkomend'],
];

function sectorOf(name: string, profileSector?: string): Sector {
  const s = `${profileSector ?? ''} ${name}`;
  if (/asml|halfgeleider|chip|semicon|marvell|nvidia|tsmc|broadcom/i.test(s)) return 'Chips';
  if (/crypto|bitcoin|galaxy|coinbase|strive/i.test(s)) return 'Crypto';
  if (/software|technologie|cloud/i.test(s)) return 'Software & tech';
  if (/internet|sociale media|consument|e-commerce/i.test(s)) return 'Internet & consument';
  if (/gezond|zorg|farma|medic/i.test(s)) return 'Gezondheid';
  if (/betalen|financieel|bank|verzeker/i.test(s)) return 'Financieel & betalen';
  if (/energie|industrie|olie/i.test(s)) return 'Industrie & energie';
  return 'Overig';
}

export interface Exposure {
  regions: Record<Region, number>;
  sectors: Record<Sector, number>;
  etfShare: number;
  singles: { ticker: string; name: string; share: number }[];
  largestSingle: { ticker: string; name: string; share: number } | null;
  unknown: string[];
  /** Effectief aantal posities (1 / som van de kwadraten van de gewichten) */
  effectiveN: number;
  usd: number;
}

export function computeExposure(positions: StockPosition[]): Exposure {
  const regions = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
  const sectors = Object.fromEntries(SECTORS.map((s) => [s, 0])) as Record<Sector, number>;
  const total = positions.reduce((s, p) => s + p.currentValue, 0);
  const singles: Exposure['singles'] = [];
  const unknown: string[] = [];
  let etfShare = 0;
  let hhi = 0;
  if (total <= 0) {
    return { regions, sectors, etfShare: 0, singles, largestSingle: null, unknown, effectiveN: 0, usd: 0 };
  }
  for (const p of positions) {
    const w = p.currentValue / total;
    const profile = findProfile(p.stock);
    if (isEtf(p.stock)) {
      etfShare += w;
      // Een ETF telt als (bijna) volledig gespreid: voor de concentratie rekenen we hem als 10 kleine stukjes.
      hhi += 10 * (w / 10) ** 2;
      const mix = ETF_MIX.find((m) => m.match.test(`${p.stock.ticker} ${p.stock.name}`)) ?? ETF_MIX.find((m) => m.label === 'Ontwikkelde landen')!;
      for (const [r, f] of Object.entries(mix.regions)) regions[r as Region] += w * (f ?? 0);
      for (const [s, f] of Object.entries(mix.sectors)) sectors[s as Sector] += w * (f ?? 0);
    } else {
      hhi += w * w;
      const name = p.stock.name;
      singles.push({ ticker: p.stock.ticker, name, share: w });
      const country = profile?.country ?? '';
      const region = COUNTRY_REGION.find(([re]) => re.test(country))?.[1];
      if (!profile) unknown.push(name);
      regions[region ?? 'Overig'] += w;
      sectors[sectorOf(name, profile?.sector)] += w;
    }
  }
  singles.sort((a, b) => b.share - a.share);
  return {
    regions,
    sectors,
    etfShare,
    singles,
    largestSingle: singles[0] ?? null,
    unknown,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    usd: regions.VS,
  };
}

export interface ScorePart {
  id: string;
  label: string;
  score: number;
  max: number;
  verdict: string;
  tone: 'good' | 'ok' | 'bad';
}

const pctTxt = (v: number) => `${Math.round(v * 100)}%`;

/** Een cijfer van 0 tot 100 voor hoe stevig je portefeuille in elkaar zit, met uitleg per onderdeel. */
export function healthScore(e: Exposure): { total: number; parts: ScorePart[]; label: string } {
  const parts: ScorePart[] = [];
  const tone = (score: number, max: number): ScorePart['tone'] => (score >= max * 0.75 ? 'good' : score >= max * 0.45 ? 'ok' : 'bad');
  const push = (id: string, label: string, score: number, max: number, verdict: string) => parts.push({ id, label, score, max, verdict, tone: tone(score, max) });

  const ls = e.largestSingle?.share ?? 0;
  const s1 = ls <= 0.1 ? 25 : ls <= 0.2 ? 18 : ls <= 0.35 ? 10 : 4;
  push(
    'single',
    'Niet alles op één paard',
    s1,
    25,
    e.largestSingle
      ? `Je grootste losse aandeel (${e.largestSingle.name}) is ${pctTxt(ls)} van alles. ${ls <= 0.1 ? 'Prima: één tegenvaller doet weinig pijn.' : ls <= 0.2 ? 'Nog te overzien, maar je voelt het als dit aandeel hard zakt.' : 'Flink: als dit bedrijf tegenvalt, zie je dat direct in je totaal.'}`
      : 'Je hebt geen losse aandelen, alleen fondsen. Heel gespreid.'
  );

  const us = e.regions.VS;
  const s2 = us <= 0.6 ? 20 : us <= 0.75 ? 15 : us <= 0.9 ? 8 : 3;
  push('region', 'Over de wereld gespreid', s2, 20, `${pctTxt(us)} zit in Amerika, ${pctTxt(e.regions.Europa)} in Europa en ${pctTxt(e.regions.Azië + e.regions.Opkomend)} in Azië en opkomende landen. ${us > 0.75 ? 'Je bent sterk afhankelijk van de Amerikaanse beurs (en de dollar).' : 'Een gezonde mix.'}`);

  const topSector = (Object.entries(e.sectors) as [Sector, number][]).sort((a, b) => b[1] - a[1])[0];
  const techLike = e.sectors['Software & tech'] + e.sectors.Chips;
  const s3 = topSector[1] <= 0.3 ? 20 : topSector[1] <= 0.45 ? 14 : topSector[1] <= 0.6 ? 7 : 3;
  push('sector', 'Over sectoren gespreid', s3, 20, `Grootste sector: ${topSector[0]} met ${pctTxt(topSector[1])}. Tech en chips samen: ${pctTxt(techLike)}. ${techLike > 0.5 ? 'Bewuste keuze voor tech, maar als tech een slecht jaar heeft, merk je dat overal.' : ''}`.trim());

  const c = e.sectors.Crypto;
  const s4 = c <= 0.05 ? 15 : c <= 0.1 ? 11 : c <= 0.2 ? 6 : 2;
  push('risk', 'Gokjes onder controle', s4, 15, c > 0 ? `${pctTxt(c)} zit in crypto-gerelateerde aandelen. Die kunnen in een paar weken de helft waard worden (of verdubbelen). ${c <= 0.1 ? 'Als klein deel van het geheel prima.' : 'Dat is een flink deel.'}` : 'Geen crypto-aandelen: rustig op dit vlak.');

  const s5 = e.etfShare >= 0.5 ? 20 : e.etfShare >= 0.3 ? 15 : e.etfShare >= 0.15 ? 9 : 4;
  push('base', 'Een stevige basis', s5, 20, `${pctTxt(e.etfShare)} zit in brede fondsen (ETF's). ${e.etfShare >= 0.5 ? 'Sterke basis: de rest kun je als je "eigen picks" zien.' : 'Een grotere basis in ETF\'s maakt je minder afhankelijk van je eigen keuzes.'}`);

  const total = parts.reduce((s, p) => s + p.score, 0);
  const label = total >= 80 ? 'Stevig gebouwd' : total >= 65 ? 'Goed op weg' : total >= 45 ? 'Kan steviger' : 'Wankel';
  return { total, parts, label };
}

/** Wat voor belegger ben je? Een knipoog op basis van je verdeling (voor Wrapped en de analyse). */
export function investorType(e: Exposure, txCount: number, months: number): { title: string; emoji: string; text: string } {
  const tech = e.sectors['Software & tech'] + e.sectors.Chips;
  if (e.sectors.Crypto >= 0.15) return { title: 'De Durfal', emoji: '🎢', text: 'Je zoekt de spanning op. Een flink deel staat in crypto: hoge pieken, diepe dalen.' };
  if (tech >= 0.5) return { title: 'De Tech-visionair', emoji: '🤖', text: 'Je gelooft dat software, chips en AI de wereld gaan veranderen, en je zet daar vol op in.' };
  if (e.etfShare >= 0.6) return { title: 'De Rustige Spreider', emoji: '🧘', text: 'Brede fondsen als basis, geen stress. Je laat de wereldeconomie het werk doen.' };
  if (months > 0 && txCount / months >= 4) return { title: 'De Actieve Handelaar', emoji: '⚡', text: 'Je zit er bovenop: gemiddeld meer dan vier transacties per maand.' };
  if (e.singles.length >= 6) return { title: 'De Verzamelaar', emoji: '🧩', text: 'Veel verschillende bedrijven: je houdt van je eigen onderzoek en spreidt over losse namen.' };
  return { title: 'De Bouwer', emoji: '🧱', text: 'Stap voor stap bouw je aan een portefeuille die past bij een lange termijn.' };
}
