/** Vaste, gevalideerde categorical-palette (zie dataviz-skill) — slot-volgorde nooit wijzigen. */
export const SERIES_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#2a78d6', // blauw
  2: '#eb6834', // oranje
  3: '#1baf7a', // aqua
  4: '#eda100', // geel
  5: '#e87ba4', // magenta
};

export function seriesColor(slot: 1 | 2 | 3 | 4 | 5): string {
  return SERIES_COLORS[slot];
}
