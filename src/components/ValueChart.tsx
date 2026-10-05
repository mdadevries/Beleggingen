import React, { useMemo, useState } from 'react';
import { ValuePoint } from '../data/types.ts';
import { formatEuro, formatDate } from '../utils/portfolio.ts';

interface ValueChartProps {
  points: ValuePoint[];
}

const WIDTH = 640;
const HEIGHT = 220;
const PADDING = { top: 16, right: 12, bottom: 28, left: 12 };

/**
 * Lijngrafiek van de portefeuillewaarde door de tijd — één serie (sequentieel
 * blauw), 2px lijn, wash-vulling op 10% dekking, hairline-gridlines, hover
 * met crosshair + tooltip. Eindpunt krijgt een label (huidige waarde).
 */
export const ValueChart: React.FC<ValueChartProps> = ({ points }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { path, areaPath, coords, yTicks, minV, maxV } = useMemo(() => {
    if (points.length === 0) {
      return { path: '', areaPath: '', coords: [], yTicks: [], minV: 0, maxV: 0 };
    }
    const values = points.map((p) => p.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || rawMax || 1;
    const minV = Math.max(0, rawMin - span * 0.15);
    const maxV = rawMax + span * 0.15;

    const plotW = WIDTH - PADDING.left - PADDING.right;
    const plotH = HEIGHT - PADDING.top - PADDING.bottom;

    const coords = points.map((p, i) => {
      const x = PADDING.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
      const y = PADDING.top + plotH - ((p.value - minV) / (maxV - minV || 1)) * plotH;
      return { x, y, point: p };
    });

    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath =
      path +
      ` L${coords[coords.length - 1].x.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)}` +
      ` L${coords[0].x.toFixed(1)},${(HEIGHT - PADDING.bottom).toFixed(1)} Z`;

    // 3 nette y-ticks tussen min en max
    const tickCount = 3;
    const yTicks = Array.from({ length: tickCount }, (_, i) => {
      const v = minV + ((maxV - minV) * i) / (tickCount - 1);
      const y = PADDING.top + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;
      return { value: v, y };
    });

    return { path, areaPath, coords, yTicks, minV, maxV };
  }, [points]);

  if (points.length === 0) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen waardeverloop.</p>;
  }

  const hovered = hoverIdx !== null ? coords[hoverIdx] : null;
  const last = coords[coords.length - 1];

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  };

  return (
    <div className="relative">
      <span className="sr-only">
        Waardeverloop van {formatDate(points[0].date)} ({formatEuro(points[0].value)}) tot{' '}
        {formatDate(points[points.length - 1].date)} ({formatEuro(points[points.length - 1].value)}).
      </span>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto touch-none"
        role="presentation"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Hairline gridlines + y-as labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={t.y}
              y2={t.y}
              style={{ stroke: 'rgb(var(--border))' }}
              strokeWidth={1}
            />
            <text x={PADDING.left} y={t.y - 4} fontSize={10} style={{ fill: 'rgb(var(--text-muted))' }}>
              {formatEuro(t.value)}
            </text>
          </g>
        ))}

        {/* Area wash */}
        <path d={areaPath} style={{ fill: 'rgb(var(--series-1))' }} opacity={0.1} stroke="none" />
        {/* Lijn */}
        <path d={path} fill="none" style={{ stroke: 'rgb(var(--series-1))' }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Eindpunt-marker met surface ring */}
        <circle cx={last.x} cy={last.y} r={5} style={{ fill: 'rgb(var(--series-1))', stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              style={{ stroke: 'rgb(var(--border-strong))' }}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle cx={hovered.x} cy={hovered.y} r={5} style={{ fill: 'rgb(var(--series-1))', stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />
          </>
        )}

        {/* X-as labels: eerste, midden, laatste */}
        {[0, Math.floor((coords.length - 1) / 2), coords.length - 1].map((i, idx) => (
          <text
            key={idx}
            x={coords[i].x}
            y={HEIGHT - 8}
            fontSize={10}
            style={{ fill: 'rgb(var(--text-muted))' }}
            textAnchor={idx === 0 ? 'start' : idx === 2 ? 'end' : 'middle'}
          >
            {formatDate(points[i].date)}
          </text>
        ))}
      </svg>

      {hovered && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full bg-[rgb(var(--text-primary))] text-[rgb(var(--surface))] text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100 - 4}%`,
          }}
        >
          <div className="font-semibold">{formatEuro(hovered.point.value)}</div>
          <div className="opacity-70">{formatDate(hovered.point.date)}</div>
        </div>
      )}
    </div>
  );
};
