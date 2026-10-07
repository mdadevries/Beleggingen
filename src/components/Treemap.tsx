import React from 'react';
import { StockPosition } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { useElementWidth } from '../hooks/useElementWidth.ts';

interface TreemapProps {
  positions: StockPosition[];
  onSelect: (ticker: string) => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap: vlakken zo vierkant mogelijk, oppervlakte = waarde. */
function squarify<T extends { value: number }>(items: T[], rect: Rect): (T & Rect)[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const nodes = [...items].sort((a, b) => b.value - a.value).map((item) => ({ item, area: item.value * scale }));
  const out: (T & Rect)[] = [];
  let { x, y, w, h } = rect;

  const worst = (row: { area: number }[], side: number) => {
    const s = row.reduce((t, n) => t + n.area, 0);
    const mx = Math.max(...row.map((n) => n.area));
    const mn = Math.min(...row.map((n) => n.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };

  const place = (row: { item: T; area: number }[]) => {
    const s = row.reduce((t, n) => t + n.area, 0);
    if (w >= h) {
      const rw = s / h;
      let cy = y;
      for (const n of row) {
        const nh = n.area / rw;
        out.push({ ...n.item, x, y: cy, w: rw, h: nh });
        cy += nh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const n of row) {
        const nw = n.area / rh;
        out.push({ ...n.item, x: cx, y, w: nw, h: rh });
        cx += nw;
      }
      y += rh;
      h -= rh;
    }
  };

  let row: { item: T; area: number }[] = [];
  let i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, nodes[i]], side) <= worst(row, side)) {
      row.push(nodes[i]);
      i++;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

/** Blokken: hoe groter het blok, hoe meer van je geld in dat aandeel zit. */
export const Treemap: React.FC<TreemapProps> = ({ positions, onSelect }) => {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const aspect = width < 520 ? 1.05 : 2.1;
  const height = Math.round(width / aspect);
  const tiles = squarify(
    positions.map((p) => ({ p, value: p.currentValue })),
    { x: 0, y: 0, w: 100 * aspect, h: 100 }
  );

  return (
    <div ref={ref}>
      <div className="relative w-full overflow-hidden rounded-xl" style={{ height }}>
        {tiles.map((t) => {
          const { p } = t;
          const dark = p.stock.colorSlot >= 3;
          const big = t.w * t.h > 1400;
          return (
            <button
              key={p.stock.ticker}
              type="button"
              onClick={() => onSelect(p.stock.ticker)}
              className="absolute flex flex-col items-start justify-start text-left p-2.5 sm:p-3 transition-[filter] hover:brightness-110 focus-visible:z-10"
              style={{
                left: `${(t.x / (100 * aspect)) * 100}%`,
                top: `${t.y}%`,
                width: `${(t.w / (100 * aspect)) * 100}%`,
                height: `${t.h}%`,
                backgroundColor: seriesColor(p.stock.colorSlot),
                color: dark ? '#1f2937' : '#ffffff',
                boxShadow: 'inset 0 0 0 2px rgb(var(--surface))',
              }}
              aria-label={`${p.stock.name}: ${formatPercentPlain(p.allocation, 0)} van je portefeuille`}
            >
              <span className="block text-sm font-bold leading-tight truncate">{p.stock.ticker}</span>
              <span className="block text-xs font-semibold opacity-90 tabular">{formatPercentPlain(p.allocation, 0)}</span>
              {big && p.invested > 0 && (
                <span className="block mt-1 text-xs opacity-80 tabular">{formatPercent(p.profitLossPct)}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">Grootte = deel van je portefeuille. Klein getal = rendement sinds aankoop.</p>
    </div>
  );
};
