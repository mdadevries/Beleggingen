/** Vaste, gevalideerde categorical-palette (zie dataviz-skill): slot-volgorde nooit wijzigen. */
export const SERIES_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#2a78d6', // blauw
  2: '#eb6834', // oranje
  3: '#1baf7a', // aqua
  4: '#eda100', // geel
  5: '#e87ba4', // magenta
};

/** Grijs voor alles buiten de top 5 (zie --series-other in index.css). */
export const OTHER_COLOR = 'rgb(var(--series-other))';

export function seriesColor(slot: 1 | 2 | 3 | 4 | 5): string {
  return SERIES_COLORS[slot];
}

/**
 * Kleur per aandeel op basis van de rangorde in je portefeuille: de vijf
 * grootste krijgen elk een eigen kleur, de rest is grijs. Meer dan vijf
 * kleuren naast elkaar is niet te onderscheiden. `positions` moet op waarde
 * gesorteerd zijn (grootste eerst).
 */
export function assignColors(positions: { stock: { ticker: string } }[]): Record<string, string> {
  const map: Record<string, string> = {};
  positions.forEach((p, i) => {
    map[p.stock.ticker] = i < 5 ? SERIES_COLORS[(i + 1) as 1 | 2 | 3 | 4 | 5] : OTHER_COLOR;
  });
  return map;
}
