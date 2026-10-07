import React, { useId, useMemo, useState } from 'react';
import { SeriesPoint, Stock } from '../data/types.ts';
import { seriesColor } from '../utils/colors.ts';
import { formatDate, formatDateShort, formatEuro, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { niceScale } from '../utils/scale.ts';
import { useElementWidth } from '../hooks/useElementWidth.ts';

interface PortfolioChartProps {
  series: SeriesPoint[];
  stocks: Stock[];
  onSelectStock?: (ticker: string) => void;
}

type Mode = 'waarde' | 'verdeling' | 'rendement';

const MODES: { id: Mode; label: string }[] = [
  { id: 'waarde', label: 'Waarde' },
  { id: 'verdeling', label: 'Verdeling' },
  { id: 'rendement', label: 'Rendement' },
];

const DAY_MS = 86_400_000;
const RANGES = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '6m', label: '6M', days: 180 },
  { id: '1j', label: '1J', days: 365 },
  { id: 'alles', label: 'Alles', days: Infinity },
] as const;

const PAD = { top: 14, right: 8, bottom: 26, left: 8 };

/**
 * Het hoofddiagram. Beweeg met je muis (of vinger) over de grafiek: de cijfers
 * erboven en de lijst eronder lopen mee. Drie weergaven: waarde (gestapeld per
 * aandeel), verdeling (hoe je geld verdeeld was) en rendement (winst in %).
 * In de anonieme modus verdwijnen de euro's: dan blijft verdeling + rendement.
 */
export const PortfolioChart: React.FC<PortfolioChartProps> = ({ series, stocks, onSelectStock }) => {
  const { hidden } = usePrivacy();
  const { ref: wrapRef, width: W } = useElementWidth<HTMLDivElement>();
  const H = W < 520 ? 230 : 290;
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = H - PAD.top - PAD.bottom;
  const clipId = 'reveal' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [modeChoice, setModeChoice] = useState<Mode>('waarde');
  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]['id']>('alles');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const mode: Mode = hidden && modeChoice === 'waarde' ? 'verdeling' : modeChoice;

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

  const shown = useMemo(
    () =>
      stocks
        .filter((s) => visible.some((p) => (p.values[s.ticker] ?? 0) > 0))
        .sort((a, b) => a.colorSlot - b.colorSlot),
    [stocks, visible]
  );

  const geo = useMemo(() => {
    if (visible.length < 2) return null;
    const t0 = visible[0].t;
    const t1 = visible[visible.length - 1].t;
    const xOf = (t: number) => PAD.left + ((t - t0) / Math.max(1, t1 - t0)) * PLOT_W;

    let lo = 0;
    let hi = 1;
    let ticks: number[] = [];
    let pct: number[] = [];

    if (mode === 'waarde') {
      const sc = niceScale(0, Math.max(...visible.map((p) => p.total)) * 1.05);
      ({ lo, hi, ticks } = sc);
    } else if (mode === 'verdeling') {
      lo = 0;
      hi = 1;
      ticks = [0, 0.25, 0.5, 0.75, 1];
    } else {
      pct = visible.map((p) => (p.cost > 0 ? (p.total - p.cost) / p.cost : 0));
      const sc = niceScale(Math.min(0, ...pct), Math.max(0, ...pct), 3);
      ({ lo, hi, ticks } = sc);
      if (hi === lo) hi = lo + 0.1;
    }
    const yOf = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo)) * PLOT_H;

    // Gestapelde grenzen per punt
    const stacks = visible.map((p) => {
      const denom = mode === 'verdeling' ? p.total || 1 : 1;
      let cum = 0;
      return shown.map((s) => {
        const from = cum;
        cum += (p.values[s.ticker] ?? 0) / denom;
        return { from, to: cum };
      });
    });

    const areas = shown.map((s, si) => {
      const up = visible.map((p, i) => `${xOf(p.t).toFixed(1)},${yOf(stacks[i][si].to).toFixed(1)}`);
      const down = visible
        .map((p, i) => `${xOf(p.t).toFixed(1)},${yOf(stacks[i][si].from).toFixed(1)}`)
        .reverse();
      return { stock: s, d: `M${up.join(' L')} L${down.join(' L')} Z` };
    });

    const linePath =
      mode === 'rendement'
        ? visible.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(pct[i]).toFixed(1)}`).join(' ')
        : '';
    const lineArea = linePath
      ? `${linePath} L${xOf(visible[visible.length - 1].t).toFixed(1)},${yOf(0).toFixed(1)} L${xOf(visible[0].t).toFixed(1)},${yOf(0).toFixed(1)} Z`
      : '';

    return { xOf, yOf, ticks, areas, linePath, lineArea, pct, zeroY: yOf(0) };
  }, [visible, shown, mode, W, H, PLOT_W, PLOT_H]);

  if (!geo || visible.length < 2) {
    return <p className="text-sm text-[rgb(var(--text-muted))] italic">Nog geen waardeverloop.</p>;
  }

  const idx = hoverIdx !== null && hoverIdx < visible.length ? hoverIdx : visible.length - 1;
  const point = visible[idx];
  const resultPct = point.cost > 0 ? (point.total - point.cost) / point.cost : 0;
  const hovering = hoverIdx !== null;

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

  const fmtTick = (v: number) => (mode === 'waarde' ? formatEuro(v) : formatPercentPlain(v, 0));

  const topY =
    mode === 'rendement' ? geo.yOf(geo.pct[idx]) : geo.yOf(mode === 'verdeling' ? 1 : point.total);

  const bigText =
    mode === 'waarde'
      ? formatEuro(point.total)
      : mode === 'rendement'
        ? formatPercent(geo.pct[idx])
        : formatDate(point.date);
  const subText =
    mode === 'waarde'
      ? `${formatDate(point.date)} · rendement ${formatPercent(resultPct)}`
      : mode === 'rendement'
        ? `${formatDate(point.date)} · t.o.v. wat je had ingelegd`
        : 'Zo was je geld verdeeld';

  return (
    <div>
      {/* Cijfers die meebewegen met de cursor */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-3">
        <div aria-live="off" className="min-w-0">
          <p
            className={`text-2xl sm:text-3xl font-bold leading-tight tabular ${
              mode === 'rendement'
                ? geo.pct[idx] >= 0
                  ? 'text-[rgb(var(--status-good))]'
                  : 'text-[rgb(var(--status-critical))]'
                : 'text-[rgb(var(--text-primary))]'
            }`}
          >
            {bigText}
          </p>
          <p className={`text-xs mt-0.5 ${hovering ? 'text-[rgb(var(--text-secondary))]' : 'text-[rgb(var(--text-muted))]'}`}>
            {subText}
          </p>
        </div>

        <div role="tablist" aria-label="Weergave" className="inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))]">
          {MODES.filter((m) => !(hidden && m.id === 'waarde')).map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setModeChoice(m.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                mode === m.id
                  ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm'
                  : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block max-w-full select-none"
        style={{ touchAction: 'pan-y' }}
        role="img"
        aria-label={`Diagram van ${formatDate(visible[0].date)} tot ${formatDate(visible[visible.length - 1].date)}, weergave ${mode}.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <clipPath id={clipId} key={`${mode}-${range.id}`}>
            <rect className="reveal-rect" x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>

        {/* Gridlijnen (achter de vlakken) */}
        {geo.ticks.map((v, i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={geo.yOf(v)}
            y2={geo.yOf(v)}
            style={{ stroke: 'rgb(var(--border))' }}
            strokeWidth={1}
          />
        ))}

        <g clipPath={`url(#${clipId})`}>
          {mode !== 'rendement' &&
            geo.areas.map((a) => (
              <path
                key={a.stock.ticker}
                d={a.d}
                style={{ fill: seriesColor(a.stock.colorSlot), stroke: 'rgb(var(--surface))' }}
                strokeWidth={1}
                fillOpacity={0.92}
              />
            ))}
          {mode === 'rendement' && (
            <>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.zeroY} y2={geo.zeroY} style={{ stroke: 'rgb(var(--border-strong))' }} strokeWidth={1} />
              <path d={geo.lineArea} style={{ fill: 'rgb(var(--series-1))' }} opacity={0.1} />
              <path d={geo.linePath} fill="none" style={{ stroke: 'rgb(var(--series-1))' }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}
        </g>

        {/* As-labels bovenop, met lichte rand zodat ze leesbaar blijven op de kleuren */}
        {geo.ticks.map((v, i) =>
          mode === 'waarde' && v === 0 ? null : (
            <text
              key={i}
              x={PAD.left + 4}
              y={geo.yOf(v) - 5}
              fontSize={11}
              fontWeight={500}
              style={{
                fill: 'rgb(var(--text-secondary))',
                stroke: 'rgb(var(--surface))',
                strokeWidth: 3.5,
                paintOrder: 'stroke',
              }}
            >
              {fmtTick(v)}
            </text>
          )
        )}

        {/* Meebewegende cursor */}
        <line
          x1={geo.xOf(point.t)}
          x2={geo.xOf(point.t)}
          y1={PAD.top}
          y2={H - PAD.bottom}
          style={{ stroke: 'rgb(var(--text-primary))' }}
          strokeOpacity={hovering ? 0.55 : 0.2}
          strokeWidth={1}
          strokeDasharray={hovering ? undefined : '3,3'}
        />
        <circle
          cx={geo.xOf(point.t)}
          cy={topY}
          r={5}
          style={{ fill: mode === 'rendement' ? 'rgb(var(--series-1))' : 'rgb(var(--text-primary))', stroke: 'rgb(var(--chart-ring))' }}
          strokeWidth={2}
        />

        {/* X-as */}
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

      {/* Periode */}
      {availableRanges.length > 1 && (
        <div className="mt-2 flex gap-1" role="group" aria-label="Periode">
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
      )}

      {/* Lijst die meeloopt met de cursor */}
      {mode !== 'rendement' && (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-5 gap-y-1">
          {[...shown].reverse().map((s) => {
            const v = point.values[s.ticker] ?? 0;
            const share = point.total > 0 ? v / point.total : 0;
            return (
              <li key={s.ticker}>
                <button
                  type="button"
                  onClick={() => onSelectStock?.(s.ticker)}
                  className="w-full flex items-center gap-2 py-1.5 text-left text-xs rounded-md hover:bg-[rgb(var(--surface-sunken))] px-1 -mx-1"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seriesColor(s.colorSlot) }} aria-hidden="true" />
                  <span className="font-semibold text-[rgb(var(--text-primary))] truncate">{s.ticker}</span>
                  <span className="ml-auto tabular text-[rgb(var(--text-secondary))]">
                    {mode === 'waarde' && !hidden ? formatEuro(v) : formatPercentPlain(share, 0)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
