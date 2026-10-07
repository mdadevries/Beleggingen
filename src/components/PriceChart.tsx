import React, { useMemo, useState } from 'react';
import { Stock, Transaction } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatDate, formatDateShort, formatEuroPrecise } from '../utils/portfolio.ts';
import { niceScale } from '../utils/scale.ts';
import { Private } from '../hooks/usePrivacy.tsx';
import { useElementWidth } from '../hooks/useElementWidth.ts';

interface PriceChartProps {
  stock: Stock;
  transactions: Transaction[];
  avgBuyPrice: number;
}

const PAD = { top: 16, right: 12, bottom: 26, left: 8 };

interface Pt {
  t: number;
  date: string;
  price: number;
  kind: 'Kopen' | 'Verkopen' | 'Nu';
  quantity?: number;
}

/**
 * Koers op de momenten dat jij kocht of verkocht, plus de koers van nu.
 * Dit zijn echte datapunten; wat ertussen gebeurde weten we niet, dus
 * er wordt bewust niets "verzonnen" tussen de punten.
 */
export const PriceChart: React.FC<PriceChartProps> = ({ stock, transactions, avgBuyPrice }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const { ref: wrapRef, width: W } = useElementWidth<HTMLDivElement>(520);
  const H = W < 480 ? 220 : 250;
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = H - PAD.top - PAD.bottom;

  const points = useMemo<Pt[]>(() => {
    const txs = transactions
      .filter((t) => t.ticker === stock.ticker)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map<Pt>((t) => ({
        t: Date.parse(t.date + 'T00:00:00Z'),
        date: t.date,
        price: t.price,
        kind: t.type,
        quantity: t.quantity,
      }));
    const now = new Date();
    const todayT = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const last = txs[txs.length - 1];
    const t = Math.max(todayT, last ? last.t : todayT);
    return [...txs, { t, date: new Date(t).toISOString().slice(0, 10), price: stock.currentPrice, kind: 'Nu' }];
  }, [transactions, stock]);

  const geo = useMemo(() => {
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const prices = points.map((p) => p.price);
    if (avgBuyPrice > 0) prices.push(avgBuyPrice);
    const lo0 = Math.min(...prices);
    const hi0 = Math.max(...prices);
    const pad = (hi0 - lo0 || hi0 * 0.1 || 1) * 0.15;
    const sc = niceScale(Math.max(0, lo0 - pad), hi0 + pad, 3);
    const xOf = (t: number) => PAD.left + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * PLOT_W;
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * PLOT_H;
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(' ');
    return { xOf, yOf, ticks: sc.ticks, path };
  }, [points, avgBuyPrice, PLOT_W, PLOT_H]);

  const color = seriesColor(stock.colorSlot);
  const idx = hoverIdx ?? points.length - 1;
  const p = points[idx];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.forEach((pt, i) => {
      const d = Math.abs(geo.xOf(pt.t) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  const sub =
    p.kind === 'Nu' ? (
      'Huidige koers'
    ) : (
      <>
        {formatDate(p.date)} · {p.kind === 'Kopen' ? 'Gekocht' : 'Verkocht'}: <Private>{p.quantity}</Private> stuks
      </>
    );

  return (
    <div>
      <div className="mb-3">
        <p className="text-2xl sm:text-3xl font-bold leading-tight tabular text-[rgb(var(--text-primary))]">{formatEuroPrecise(p.price)}</p>
        <p className="text-xs mt-0.5 text-[rgb(var(--text-secondary))]">{sub}</p>
      </div>

      <div ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full select-none"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={`Koers van ${stock.name} op je transactiemomenten`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {geo.ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={geo.yOf(v)} y2={geo.yOf(v)} style={{ stroke: 'rgb(var(--border))' }} strokeWidth={1} />
            <text x={PAD.left} y={geo.yOf(v) - 5} fontSize={11} style={{ fill: 'rgb(var(--text-muted))', stroke: 'rgb(var(--surface))', strokeWidth: 3.5, paintOrder: 'stroke' }}>
              {formatEuroPrecise(v)}
            </text>
          </g>
        ))}

        {avgBuyPrice > 0 && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={geo.yOf(avgBuyPrice)}
              y2={geo.yOf(avgBuyPrice)}
              style={{ stroke: 'rgb(var(--text-secondary))' }}
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.7}
            />
            <text
              x={W - PAD.right}
              y={geo.yOf(avgBuyPrice) - 5}
              fontSize={11}
              textAnchor="end"
              style={{ fill: 'rgb(var(--text-secondary))', stroke: 'rgb(var(--surface))', strokeWidth: 3, paintOrder: 'stroke' }}
            >
              Gem. aankoop {formatEuroPrecise(avgBuyPrice)}
            </text>
          </g>
        )}

        <path d={geo.path} fill="none" style={{ stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hoverIdx !== null && (
          <line x1={geo.xOf(p.t)} x2={geo.xOf(p.t)} y1={PAD.top} y2={H - PAD.bottom} style={{ stroke: 'rgb(var(--border-strong))' }} strokeDasharray="3,3" />
        )}

        {points.map((pt, i) => (
          <circle
            key={i}
            cx={geo.xOf(pt.t)}
            cy={geo.yOf(pt.price)}
            r={i === idx ? 6 : 4.5}
            style={{
              fill: pt.kind === 'Kopen' ? 'rgb(var(--status-good-bg))' : pt.kind === 'Verkopen' ? 'rgb(var(--status-critical))' : color,
              stroke: 'rgb(var(--chart-ring))',
            }}
            strokeWidth={2}
          />
        ))}

        {[0, points.length - 1].map((i, k) => (
          <text
            key={k}
            x={geo.xOf(points[i].t)}
            y={H - 8}
            fontSize={11}
            textAnchor={k === 0 ? 'start' : 'end'}
            style={{ fill: 'rgb(var(--text-muted))' }}
          >
            {formatDateShort(points[i].date)}
          </text>
        ))}
      </svg>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--text-muted))]">
        <li className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgb(var(--status-good-bg))' }} aria-hidden="true" />
          Gekocht
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'rgb(var(--status-critical))' }} aria-hidden="true" />
          Verkocht
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          Nu
        </li>
      </ul>
    </div>
  );
};
