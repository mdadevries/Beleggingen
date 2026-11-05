import { CANDIDATES, Candidate } from '../data/candidates.ts';
import { StockPosition } from '../data/types.ts';
import { Exposure, Region, Sector } from './analysis.ts';

export interface Idea {
  candidate: Candidate;
  score: number;
  /** Waarom juist deze, berekend uit jouw portefeuille (in gewone taal). */
  reasons: string[];
  /** Hoe je verdeling verschuift als je dit idee voor ~5% van je portefeuille zou kopen. */
  shift: { label: string; from: number; to: number }[];
}

const REGION_TARGET: Record<Region, number> = { VS: 0.6, Europa: 0.18, Azië: 0.08, Opkomend: 0.1, Overig: 0.04 };
const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Kiest ideeën om te onderzoeken. Elk idee krijgt punten voor het vullen van een gat
 * (regio en sector waar je weinig in hebt), voor passen bij hoe je belegt (AI, winstgevend,
 * minder bekend) en minpunten voor iets wat je al hebt of wat te veel lijkt op een eerder
 * gekozen idee. Volledig uitlegbaar: de redenen die je ziet zijn de punten die het kreeg.
 */
export function rankIdeas(exposure: Exposure, positions: StockPosition[], skip = 0, count = 3): Idea[] {
  const held = positions.map((p) => `${p.stock.ticker} ${p.stock.name}`).join(' | ');
  const pool = CANDIDATES.filter((c) => !c.heldMatch.test(held));
  const techLike = exposure.sectors['Software & tech'] + exposure.sectors.Chips;

  const scored = pool.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    // 1. Regio-gat
    const gap = REGION_TARGET[c.region] - exposure.regions[c.region];
    if (gap > 0.02) {
      score += Math.min(40, gap * 250);
      reasons.push(`Je hebt nu ${pct(exposure.regions[c.region])} in ${c.region === 'VS' ? 'Amerika' : c.region === 'Opkomend' ? 'opkomende landen' : c.region}. Dit voegt daar iets aan toe.`);
    } else if (c.region === 'VS' && exposure.regions.VS > 0.75) {
      score -= 15;
    }
    // 2. Sector-gat (alleen sectoren die je relatief weinig hebt)
    const s = exposure.sectors[c.sector as Sector] ?? 0;
    if (c.sector !== 'Overig') {
      if (s < 0.06) {
        score += 22;
        reasons.push(`${c.sector} is nu maar ${pct(s)} van je portefeuille.`);
      } else if (s < 0.15) {
        score += 10;
      } else if (s > 0.3) {
        score -= 12;
      }
    }
    // 3. Past bij hoe je belegt
    if (c.tags.includes('ai')) {
      score += 12;
      reasons.push('Verdient echt aan AI, niet alleen aan het verhaal.');
    }
    if (c.tags.includes('winstgevend')) {
      score += 10;
      if (!reasons.some((r) => r.includes('winst'))) reasons.push('Maakt al jaren winst: past bij je filter "winstgevend + AI".');
    }
    if (c.tags.includes('minder-bekend')) {
      score += 6;
      reasons.push('Minder bekend dan de grote namen die iedereen al heeft.');
    }
    if (c.tags.includes('bekend')) score -= 8;
    // 4. Basis: als je weinig ETF hebt, scoort een breed fonds extra
    if (c.kind === 'ETF' && exposure.etfShare < 0.4) {
      score += 12;
      reasons.push(`Je basis in brede fondsen is ${pct(exposure.etfShare)}; een ETF maakt je minder afhankelijk van losse keuzes.`);
    }
    // 5. Tech-zwaar? Dan iets buiten tech extra punten.
    if (techLike > 0.45 && c.sector !== 'Software & tech' && c.sector !== 'Chips') {
      score += 10;
      reasons.push(`Tech en chips zijn al ${pct(techLike)} van alles: dit spreidt buiten tech.`);
    }
    return { candidate: c, score, reasons };
  });

  // Gulzig kiezen, met strafpunten voor dezelfde sector of regio als een eerdere keuze.
  const chosen: typeof scored = [];
  const rest = [...scored];
  while (rest.length && chosen.length < skip + count) {
    rest.forEach((x) => {
      (x as { adj?: number }).adj =
        x.score -
        chosen.filter((c) => c.candidate.sector === x.candidate.sector).length * 18 -
        chosen.filter((c) => c.candidate.region === x.candidate.region).length * 8;
    });
    rest.sort((a, b) => ((b as { adj?: number }).adj ?? 0) - ((a as { adj?: number }).adj ?? 0));
    chosen.push(rest.shift()!);
  }

  return chosen.slice(skip, skip + count).map((x) => {
    const w = 0.05;
    const shift = [
      { label: x.candidate.region === 'VS' ? 'Amerika' : x.candidate.region, from: exposure.regions[x.candidate.region], to: exposure.regions[x.candidate.region] * (1 - w) + w },
      ...(x.candidate.sector !== 'Overig'
        ? [{ label: x.candidate.sector, from: exposure.sectors[x.candidate.sector], to: exposure.sectors[x.candidate.sector] * (1 - w) + w }]
        : []),
    ];
    return { ...x, reasons: x.reasons.slice(0, 4), shift };
  });
}
