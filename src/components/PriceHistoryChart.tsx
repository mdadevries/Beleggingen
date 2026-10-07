import React, { useId, useMemo, useState } from 'react';
import { Transaction } from '../data/types.ts';
import { HistoryPoints } from '../hooks/useStockData.ts';
import { formatDate, formatDateShort, formatEuroPrecise, formatPercent } from '../utils/portfolio.ts';
import { niceScale } from '../utils/scale.ts';
import { useElementWidth } from '../hooks/useElementWidth.ts';

interface Props {
  points: HistoryPoints;
  transactions: Transaction[];
  avgBuyPrice: number;
  /** Markeer je koop- en verkoopmomenten op de lijn */
  showTrades?: boolean;
}

const DAY_MS = 86_400_000;
const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '6m', label: '6M', days: 182 },
  { id: '1j', label: '1J', days: 365 },
  { id: '5j', label: '5J', days: 365 * 5 },
  { id: 'max', label: 'Max', days: Infinity },
] as const;

const PAD = { top: 20, right: 10, bottom: 26, left: 10 };
const toT = (d: string) => Date.parse(d + 'T00:00:00Z');

/**
 * De echte koers van dit aandeel of deze ETF door de tijd (dagkoersen, in euro's).
 * Beweeg over de lijn voor de koers op een dag; de bolletjes zijn jouw koop- en verkoopmomenten.
 */
export const PriceHistoryChart: React.FC<Props> = ({ points, transactions, avgBuyPrice, showTrades = true }) => {
  const { ref: wrapRef, width: W } = useElementWidth<HTMLDivElement>(520);
  const H = W < 520 ? 230 : 280;
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = H - PAD.top - PAD.bottom;
  const gradId = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = 'c' + gradId;
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('1j');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const series = useMemo(() => points.map(([d, p]) => ({ date: d, t: toT(d), price: p })), [points]);
  const spanDays = series.length > 1 ? (series[series.length - 1].t - series[0].t) / DAY_MS : 0;
  const availableRanges = RANGES.filter((r) => r.days === Infinity || r.days < spanDays - 5);
  const range = availableRanges.find((r) => r.id === rangeId) ?? availableRanges[availableRanges.length - 1] ?? RANGES[5];

  const visible = useMemo(() => {
    if (series.length === 0) return [];
    const end = series[series.length - 1].t;
    const from = range.days === Infinity ? -Infinity : end - range.days * DAY_MS;
    const v = series.filter((p) => p.t >= from);
    return v.length >= 2 ? v : series.slice(-2);
  }, [series, range]);

  const trades = useMemo(() => {
    if (!showTrades || visible.length < 2) return [];
    const t0 = visible[0].t;
    const t1 = visible[visible.length - 1].t;
    return transactions
      .map((t) => ({ ...t, ts: toT(t.date) }))
      .filter((t) => t.ts >= t0 && t.ts <= t1);
  }, [transactions, visible, showTrades]);

  const geo = useMemo(() => {
    if (visible.length < 2) return null;
    const t0 = visible[0].t;
    const t1 = visible[visible.length - 1].t;
    const xOf = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * PLOT_W;
    const prices = visible.map((p) => p.price);
    if (avgBuyPrice > 0) prices.push(avgBuyPrice);
    let lo0 = Math.min(...prices);
    let hi0 = Math.max(...prices);
    const pad = (hi0 - lo0 || hi0) * 0.1;
    lo0 = Math.max(0, lo0 - pad);
    hi0 += pad;
    const sc = niceScale(lo0, hi0, 4);
    const lo = sc.lo;
    const hi = sc.hi === sc.lo ? sc.lo + 1 : sc.hi;
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;
    const path = visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(' ');
    const baseY = H - PAD.bottom;
    const area = `${path} L${xOf(t1).toFixed(1)},${baseY} L${xOf(t0).toFixed(1)},${baseY} Z`;
    return { xOf, yOf, ticks: sc.ticks, path, area };
  }, [visible, avgBuyPrice, PLOT_W, PLOT_H, H]);

  if (!geo || visible.length < 2) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen koershistorie.</p>;
  }

  const first = visible[0];
  const last = visible[visible.length - 1];
  const idx = hoverIdx !== null && hoverIdx < visible.length ? hoverIdx : visible.length - 1;
  const point = visible[idx];
  const hovering = hoverIdx !== null;
  // Verandering over de gekozen periode, of (tijdens hoveren) van het begin van de periode tot die dag.
  const change = first.price > 0 ? point.price / first.price - 1 : 0;
  const up = last.price >= first.price;
  const lineVar = up ? '--status-good-bg' : '--status-critical';

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const t = visible[0].t + ((x - PAD.left) / PLOT_W) * (last.t - first.t);
    let lo = 0;
    let hi = visible.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (visible[mid].t < t) lo = mid;
      else hi = mid;
    }
    setHoverIdx(Math.abs(visible[lo].t - t) <= Math.abs(visible[hi].t - t) ? lo : hi);
  };

  const x = geo.xOf(point.t);
  const y = geo.yOf(point.price);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-3">
        <div className="min-w-0">
          <p className="text-2xl sm:text-3xl font-bold leading-tight tabular text-[rgb(var(--text-primary))]">{formatEuroPrecise(point.price)}</p>
          <p className="text-xs mt-0.5 tabular text-[rgb(var(--text-muted))]">
            {formatDate(point.date)}
            {' · '}
            <span style={{ color: `rgb(var(${change >= 0 ? '--status-good' : '--status-critical'}))` }} className="font-semibold">
              {formatPercent(change)}
            </span>{' '}
            {hovering ? `sinds ${formatDateShort(first.date)}` : `in deze periode (${range.label})`}
          </p>
        </div>
        {availableRanges.length > 1 && (
          <div className="inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] no-print" role="group" aria-label="Periode">
            {availableRanges.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                aria-pressed={range.id === r.id}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  range.id === r.id
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm'
                    : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block max-w-full select-none"
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label={`Koersgrafiek van ${formatDate(first.date)} tot ${formatDate(last.date)}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: `rgb(var(${lineVar}))` }} stopOpacity={0.22} />
              <stop offset="100%" style={{ stopColor: `rgb(var(${lineVar}))` }} stopOpacity={0} />
            </linearGradient>
            <clipPath id={clipId} key={range.id}>
              <rect className="reveal-rect" x={0} y={0} width={W} height={H} />
            </clipPath>
          </defs>

          {geo.ticks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.yOf(v)} y2={geo.yOf(v)} style={{ stroke: 'rgb(var(--border))' }} strokeWidth={1} />
              <text
                x={PAD.left}
                y={geo.yOf(v) - 5}
                fontSize={11}
                style={{ fill: 'rgb(var(--text-muted))', stroke: 'rgb(var(--surface))', strokeWidth: 3, paintOrder: 'stroke' }}
              >
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
                style={{ stroke: 'rgb(var(--text-muted))' }}
                strokeWidth={1.25}
                strokeDasharray="5,4"
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

          <g clipPath={`url(#${clipId})`}>
            <path d={geo.area} fill={`url(#${gradId})`} />
            <path d={geo.path} fill="none" style={{ stroke: `rgb(var(${lineVar}))` }} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          </g>

          {trades.map((t) => (
            <circle
              key={t.id}
              cx={geo.xOf(t.ts)}
              cy={geo.yOf(t.price)}
              r={5}
              style={{
                fill: t.type === 'Kopen' ? 'rgb(var(--status-good-bg))' : 'rgb(var(--status-critical))',
                stroke: 'rgb(var(--chart-ring))',
              }}
              strokeWidth={2}
            >
              <title>{`${t.type} op ${formatDate(t.date)} voor ${formatEuroPrecise(t.price)}`}</title>
            </circle>
          ))}

          <line
            x1={x}
            x2={x}
            y1={PAD.top}
            y2={H - PAD.bottom}
            style={{ stroke: 'rgb(var(--text-primary))' }}
            strokeOpacity={hovering ? 0.5 : 0}
            strokeWidth={1}
          />
          <circle cx={x} cy={y} r={hovering ? 5 : 4} style={{ fill: `rgb(var(${lineVar}))`, stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />

          {[0, Math.floor((visible.length - 1) / 2), visible.length - 1].map((i, k) => (
            <text
              key={k}
              x={geo.xOf(visible[i].t)}
              y={H - 8}
              fontSize={11}
              textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
              style={{ fill: 'rgb(var(--text-muted))' }}
            >
              {formatDateShort(visible[i].date)}
            </text>
          ))}
        </svg>
      </div>

      {trades.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--text-muted))]">
          <li className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--status-good-bg))]" aria-hidden="true" />
            Gekocht
          </li>
          {trades.some((t) => t.type === 'Verkopen') && (
            <li className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--status-critical))]" aria-hidden="true" />
              Verkocht
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
