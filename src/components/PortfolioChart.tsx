import React, { useId, useMemo, useState } from 'react';
import { SeriesPoint } from '../data/types.ts';
import { formatDate, formatDateShort, formatEuro, formatPercent } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';
import { niceScale } from '../utils/scale.ts';
import { useElementWidth } from '../hooks/useElementWidth.ts';

interface PortfolioChartProps {
  series: SeriesPoint[];
}

type Mode = 'waarde' | 'rendement';

const DAY_MS = 86_400_000;
const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '6m', label: '6M', days: 180 },
  { id: '1j', label: '1J', days: 365 },
  { id: 'alles', label: 'Alles', days: Infinity },
] as const;

const PAD = { top: 14, right: 10, bottom: 26, left: 10 };

/**
 * Twee lijnen: wat je portefeuille waard is en wat je hebt ingelegd. Het
 * verschil is je winst of verlies. Beweeg over de grafiek: de cijfers erboven
 * lopen mee. In de anonieme modus blijft alleen het rendement in procenten.
 */
export const PortfolioChart: React.FC<PortfolioChartProps> = ({ series }) => {
  const { hidden } = usePrivacy();
  const { ref: wrapRef, width: W } = useElementWidth<HTMLDivElement>();
  const H = W < 520 ? 230 : 290;
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = H - PAD.top - PAD.bottom;
  const clipId = 'reveal' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [modeChoice, setModeChoice] = useState<Mode>('waarde');
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('alles');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const mode: Mode = hidden ? 'rendement' : modeChoice;

  const spanDays = series.length > 1 ? (series[series.length - 1].t - series[0].t) / DAY_MS : 0;
  const availableRanges = RANGES.filter((r) => r.days === Infinity || r.days < spanDays - 3);
  const range = availableRanges.find((r) => r.id === rangeId) ?? availableRanges[availableRanges.length - 1];

  const visible = useMemo(() => {
    if (series.length === 0) return [];
    const end = series[series.length - 1].t;
    const from = range.days === Infinity ? -Infinity : end - range.days * DAY_MS;
    const v = series.filter((p) => p.t >= from);
    return v.length >= 2 ? v : series.slice(-2);
  }, [series, range]);

  const geo = useMemo(() => {
    if (visible.length < 2) return null;
    const t0 = visible[0].t;
    const t1 = visible[visible.length - 1].t;
    const xOf = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * PLOT_W;
    const pct = visible.map((p) => (p.cost > 0 ? (p.total - p.cost) / p.cost : 0));

    let sc;
    if (mode === 'waarde') {
      const all = visible.flatMap((p) => [p.total, p.cost]);
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      const pad = (hi - lo || hi) * 0.12;
      sc = niceScale(Math.max(0, lo - pad), hi + pad, 4);
    } else {
      sc = niceScale(Math.min(0, ...pct), Math.max(0, ...pct), 3);
    }
    const lo = sc.lo;
    const hi = sc.hi === sc.lo ? sc.lo + 0.1 : sc.hi;
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

    const line = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(visible[i].t).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
    // Ingelegd bedrag springt op de dag van een aankoop: trapvorm.
    const stepLine = (vals: number[]) =>
      vals
        .map((v, i) =>
          i === 0
            ? `M${xOf(visible[i].t).toFixed(1)},${yOf(v).toFixed(1)}`
            : `L${xOf(visible[i].t).toFixed(1)},${yOf(vals[i - 1]).toFixed(1)} L${xOf(visible[i].t).toFixed(1)},${yOf(v).toFixed(1)}`
        )
        .join(' ');

    const totals = visible.map((p) => p.total);
    const costs = visible.map((p) => p.cost);
    const baseY = mode === 'rendement' ? yOf(0) : H - PAD.bottom;
    const main = mode === 'waarde' ? totals : pct;
    const mainPath = line(main);
    const area = `${mainPath} L${xOf(visible[visible.length - 1].t).toFixed(1)},${baseY.toFixed(1)} L${xOf(visible[0].t).toFixed(1)},${baseY.toFixed(1)} Z`;

    return { xOf, yOf, ticks: sc.ticks, pct, mainPath, area, costPath: mode === 'waarde' ? stepLine(costs) : '', zeroY: yOf(0), main };
  }, [visible, mode, PLOT_W, PLOT_H, H]);

  if (!geo || visible.length < 2) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen waardeverloop.</p>;
  }

  const idx = hoverIdx !== null && hoverIdx < visible.length ? hoverIdx : visible.length - 1;
  const point = visible[idx];
  const resultAbs = point.total - point.cost;
  const resultPct = geo.pct[idx];
  const hovering = hoverIdx !== null;
  const good = resultAbs >= 0;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    visible.forEach((p, i) => {
      const d = Math.abs(geo.xOf(p.t) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  const fmtTick = (v: number) => (mode === 'waarde' ? formatEuro(v) : `${Math.round(v * 100)}%`);
  const cursorY = geo.yOf(geo.main[idx]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-3">
        <div className="min-w-0">
          <p
            className={`text-2xl sm:text-3xl font-bold leading-tight tabular ${
              mode === 'rendement' ? (good ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]') : 'text-[rgb(var(--text-primary))]'
            }`}
          >
            {mode === 'waarde' ? formatEuro(point.total) : formatPercent(resultPct)}
          </p>
          <p className={`text-xs mt-0.5 tabular ${hovering ? 'text-[rgb(var(--text-secondary))]' : 'text-[rgb(var(--text-muted))]'}`}>
            {formatDate(point.date)}
            {mode === 'waarde' ? (
              <>
                {' · '}ingelegd <Private>{formatEuro(point.cost)}</Private>
                {' · '}
                <span className={good ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}>
                  <Private>{formatEuro(resultAbs)}</Private> ({formatPercent(resultPct)})
                </span>
              </>
            ) : (
              ' · ten opzichte van wat je had ingelegd'
            )}
          </p>
        </div>

        {!hidden && (
          <div role="tablist" aria-label="Weergave" className="inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))]">
            {(['waarde', 'rendement'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setModeChoice(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mode === m
                    ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm'
                    : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))]'
                }`}
              >
                {m === 'waarde' ? 'Waarde' : 'Rendement'}
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
          aria-label={`Lijndiagram van ${formatDate(visible[0].date)} tot ${formatDate(visible[visible.length - 1].date)}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          <defs>
            <clipPath id={clipId} key={`${mode}-${range.id}`}>
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
                {fmtTick(v)}
              </text>
            </g>
          ))}

          <g clipPath={`url(#${clipId})`}>
            {mode === 'rendement' && (
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.zeroY} y2={geo.zeroY} style={{ stroke: 'rgb(var(--border-strong))' }} strokeWidth={1} />
            )}
            <path d={geo.area} style={{ fill: 'rgb(var(--series-1))' }} opacity={0.1} />
            {geo.costPath && (
              <path d={geo.costPath} fill="none" style={{ stroke: 'rgb(var(--text-muted))' }} strokeWidth={1.75} strokeDasharray="5,4" strokeLinejoin="round" />
            )}
            <path d={geo.mainPath} fill="none" style={{ stroke: 'rgb(var(--series-1))' }} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>

          <line
            x1={geo.xOf(point.t)}
            x2={geo.xOf(point.t)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            style={{ stroke: 'rgb(var(--text-primary))' }}
            strokeOpacity={hovering ? 0.5 : 0.18}
            strokeWidth={1}
            strokeDasharray={hovering ? undefined : '3,3'}
          />
          <circle cx={geo.xOf(point.t)} cy={cursorY} r={5} style={{ fill: 'rgb(var(--series-1))', stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />

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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        {availableRanges.length > 1 ? (
          <div className="flex gap-1" role="group" aria-label="Periode">
            {availableRanges.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangeId(r.id)}
                aria-pressed={range.id === r.id}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  range.id === r.id
                    ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]'
                    : 'text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--surface-sunken))]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {mode === 'waarde' && (
          <ul className="flex gap-4 text-xs text-[rgb(var(--text-muted))]">
            <li className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded bg-[rgb(var(--series-1))]" aria-hidden="true" />
              Waarde
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-[rgb(var(--text-muted))]" aria-hidden="true" />
              Ingelegd
            </li>
          </ul>
        )}
      </div>
    </div>
  );
};
