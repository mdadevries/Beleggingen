import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Flag } from 'lucide-react';
import { SeriesPoint, Transaction } from '../data/types.ts';
import { BENCHMARKS, MY_COLOR } from '../data/benchmarks.ts';
import { Points, cashflowReturn, maxDrawdown, simulateSameCashflows, annualVolatility, timeWeightedIndex } from '../utils/history.ts';
import { formatDate, formatDateShort, formatEuro, formatPercent } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';
import { useElementWidth } from '../hooks/useElementWidth.ts';
import { niceScale } from '../utils/scale.ts';
import { Card } from './Card.tsx';
import { PageHeader, Pill } from './ui.tsx';

interface Props {
  series: SeriesPoint[];
  transactions: Transaction[];
  benchmarks: Record<string, Points>;
  loading: boolean;
  isDemo: boolean;
}

interface Runner {
  id: string;
  label: string;
  emoji: string;
  color: string;
  values: number[];
  /** Rendement op je geldstromen per dag */
  pct: number[];
}

const PAD = { top: 18, right: 34, bottom: 26, left: 10 };
const MEDALS = ['🥇', '🥈', '🥉', '4'];

export const RacePage: React.FC<Props> = ({ series, transactions, benchmarks, loading, isDemo }) => {
  const { hidden } = usePrivacy();
  const [selected, setSelected] = useState<string[]>(['sp500', 'nasdaq', 'world']);
  const [mode, setMode] = useState<'waarde' | 'rendement'>('waarde');
  const showPct = hidden || mode === 'rendement';

  const days = useMemo(() => series.map((p) => p.date), [series]);

  // Geldstromen tot en met elke dag: voor het rendement per dag.
  const flows = useMemo(() => {
    const txs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let ti = 0;
    let inflow = 0;
    let outflow = 0;
    return days.map((d) => {
      while (ti < txs.length && txs[ti].date <= d) {
        const t = txs[ti++];
        if (t.type === 'Kopen') inflow += t.quantity * t.price;
        else outflow += t.quantity * t.price;
      }
      return { inflow, outflow };
    });
  }, [days, transactions]);

  const toPct = (vals: number[]) => vals.map((v, i) => (flows[i].inflow > 0 ? (v + flows[i].outflow) / flows[i].inflow - 1 : 0));

  const runners: Runner[] = useMemo(() => {
    const mine = series.map((p) => p.total);
    const list: Runner[] = [{ id: 'jij', label: 'Jij', emoji: '😎', color: MY_COLOR, values: mine, pct: toPct(mine) }];
    for (const b of BENCHMARKS) {
      const pts = benchmarks[b.id];
      if (!pts || !selected.includes(b.id)) continue;
      const v = simulateSameCashflows(transactions, pts, days);
      list.push({ id: b.id, label: b.label, emoji: b.emoji, color: b.color, values: v, pct: toPct(v) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, benchmarks, selected, transactions, days, flows]);

  // Afspelen
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const t0 = performance.now() - progress * 7000;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 7000);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const n = days.length;
  const playIdx = Math.max(1, Math.round(progress * (n - 1)));
  const idx = hoverIdx ?? playIdx;

  if (loading && runners.length < 2) {
    return (
      <>
        <PageHeader emoji="🏁" title="Race tegen de markt" />
        <Card>
          <p className="text-sm text-[rgb(var(--text-muted))]">De koersen van de indexen worden geladen…</p>
        </Card>
      </>
    );
  }
  if (n < 3) {
    return (
      <>
        <PageHeader emoji="🏁" title="Race tegen de markt" />
        <Card>
          <p className="text-sm text-[rgb(var(--text-muted))]">Nog te weinig geschiedenis voor een race.</p>
        </Card>
      </>
    );
  }

  const valAt = (r: Runner, i: number) => (showPct ? r.pct[i] : r.values[i]);
  const board = [...runners].sort((a, b) => valAt(b, idx) - valAt(a, idx));
  const me = runners[0];
  const final = runners.map((r) => {
    const twr = timeWeightedIndex(r.values, days, transactions);
    return { r, ret: cashflowReturn(transactions, r.values[n - 1]) ?? 0, dd: maxDrawdown(twr), vol: annualVolatility(twr, days) };
  });
  const myFinal = final[0];

  return (
    <>
      <PageHeader
        emoji="🏁"
        title="Race tegen de markt"
        subtitle="Elke euro die je in je portefeuille stopte, gaat in een parallelle wereld in een index-ETF. Zelfde dagen, zelfde bedragen. Wie wint?"
      />

      <div className="flex flex-wrap items-center gap-2">
        {BENCHMARKS.map((b) => {
          const on = selected.includes(b.id);
          const available = !!benchmarks[b.id];
          return (
            <button
              key={b.id}
              type="button"
              disabled={!available}
              aria-pressed={on}
              onClick={() => setSelected((s) => (on ? s.filter((x) => x !== b.id) : [...s, b.id]))}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-40 ${
                on ? 'border-transparent text-white' : 'border-[rgb(var(--border))] text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
              }`}
              style={on ? { background: b.color } : undefined}
            >
              <span aria-hidden="true">{b.emoji}</span> {b.label}
            </button>
          );
        })}
        {!hidden && (
          <div className="ml-auto inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))]">
            {(['waarde', 'rendement'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${mode === m ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm' : 'text-[rgb(var(--text-muted))]'}`}
              >
                {m === 'waarde' ? 'Waarde' : 'Rendement'}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs text-[rgb(var(--text-muted))] tabular">{formatDate(days[idx])}</p>
            <p className="text-sm font-semibold text-[rgb(var(--text-primary))]">
              {board[0].id === 'jij' ? '😎 Jij ligt aan kop!' : `${board[0].emoji} ${board[0].label} ligt aan kop`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--text-primary))] text-[rgb(var(--surface))] px-4 py-2 text-sm font-bold"
            >
              {playing ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
              {playing ? 'Pauze' : progress >= 1 ? 'Start de race' : 'Verder'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setProgress(1);
              }}
              className="p-2 rounded-full border border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-sunken))]"
              aria-label="Naar de finish"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <RaceChart runners={runners} days={days} showPct={showPct} playIdx={playIdx} hoverIdx={hoverIdx} onHover={setHoverIdx} />

        {/* Klassement */}
        <ol className="mt-4 space-y-1.5" aria-label="Klassement">
          {board.map((r, i) => {
            const v = valAt(r, idx);
            const gap = r.id === 'jij' ? null : valAt(me, idx) - v;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${r.id === 'jij' ? 'bg-[rgb(var(--series-1))]/10 ring-1 ring-[rgb(var(--series-1))]/30' : 'bg-[rgb(var(--surface-sunken))]'}`}
              >
                <span className="w-6 text-center text-lg" aria-label={`Plaats ${i + 1}`}>
                  {MEDALS[i] ?? i + 1}
                </span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm font-semibold text-[rgb(var(--text-primary))] truncate">
                  {r.emoji} {r.label}
                </span>
                <span className="text-sm font-bold tabular text-[rgb(var(--text-primary))]">
                  {showPct ? formatPercent(v) : <Private>{formatEuro(v)}</Private>}
                </span>
                {gap !== null && (
                  <span className={`hidden sm:inline text-xs tabular w-24 text-right ${gap >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
                    {gap >= 0 ? 'jij +' : 'jij −'}
                    {showPct ? `${Math.abs(Math.round(gap * 1000) / 10).toLocaleString('nl-NL')} pp` : <Private>{formatEuro(Math.abs(gap))}</Private>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Uitslag */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {final.slice(1).map(({ r, ret }) => {
          const diffPct = myFinal.ret - ret;
          const diffEur = me.values[n - 1] - r.values[n - 1];
          const won = diffEur >= 0;
          return (
            <div key={r.id} className={`rounded-2xl p-4 border ${won ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
              <p className="text-xs font-semibold text-[rgb(var(--text-muted))] flex items-center gap-1">
                <Flag className="w-3.5 h-3.5" aria-hidden="true" /> Jij vs {r.label}
              </p>
              <p className="text-lg font-extrabold text-[rgb(var(--text-primary))] mt-1">{won ? `Je verslaat de ${r.label} 🎉` : `De ${r.label} was sneller`}</p>
              <p className="text-sm mt-1">
                {won ? 'Je portefeuille is ' : 'In de index had je '}
                <b className="text-[rgb(var(--text-primary))]">
                  <Private>{formatEuro(Math.abs(diffEur))}</Private>
                </b>
                {won ? ' meer waard' : ' meer gehad'} ({Math.abs(Math.round(diffPct * 1000) / 10).toLocaleString('nl-NL')} procentpunt).
              </p>
            </div>
          );
        })}
      </div>

      <Card title="Achter de schermen" subtitle="Rendement over je geldstromen, de grootste dip onderweg en hoe hard elke lijn schommelt.">
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[440px]">
            <thead>
              <tr className="text-left text-xs text-[rgb(var(--text-muted))]">
                <th className="font-semibold py-2 px-1">Deelnemer</th>
                <th className="font-semibold py-2 px-1 text-right">Rendement</th>
                <th className="font-semibold py-2 px-1 text-right">Grootste dip</th>
                <th className="font-semibold py-2 px-1 text-right">Schommeling/jaar</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {final.map(({ r, ret, dd, vol }) => (
                <tr key={r.id} className="border-t border-[rgb(var(--border))]">
                  <td className="py-2 px-1 font-semibold text-[rgb(var(--text-primary))]">
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: r.color }} aria-hidden="true" />
                    {r.label}
                  </td>
                  <td className={`py-2 px-1 text-right font-semibold ${ret >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>{formatPercent(ret)}</td>
                  <td className="py-2 px-1 text-right">−{Math.round(dd * 100)}%</td>
                  <td className="py-2 px-1 text-right">{vol == null ? '–' : `${Math.round(vol * 100)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">
          {isDemo ? 'Demo: verzonnen koersen. ' : ''}Indexen via accumulerende iShares-ETF's in euro's (dividend zit in de koers). De dip en schommeling
          zijn gerekend zonder het effect van je bij- en verkopen (tijd-gewogen), dus puur hoe de beleggingen zelf bewogen.
        </p>
      </Card>
    </>
  );
};

const RaceChart: React.FC<{
  runners: Runner[];
  days: string[];
  showPct: boolean;
  playIdx: number;
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
}> = ({ runners, days, showPct, playIdx, hoverIdx, onHover }) => {
  const { ref, width: W } = useElementWidth<HTMLDivElement>();
  const H = W < 520 ? 240 : 320;
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;
  const n = days.length;
  const vals = (r: Runner) => (showPct ? r.pct : r.values);
  const all = runners.flatMap(vals);
  const lo0 = Math.min(...all, showPct ? 0 : Infinity);
  const hi0 = Math.max(...all);
  const sc = niceScale(showPct ? lo0 : Math.max(0, lo0 * 0.95), hi0 * (showPct ? 1 : 1.03) + (showPct ? 0.01 : 0), 4);
  const lo = sc.lo;
  const hi = sc.hi === sc.lo ? sc.lo + 1 : sc.hi;
  const t0 = Date.parse(days[0]);
  const t1 = Date.parse(days[n - 1]);
  const x = (i: number) => PAD.left + ((Date.parse(days[i]) - t0) / Math.max(1, t1 - t0)) * PW;
  const y = (v: number) => PAD.top + PH - ((v - lo) / (hi - lo)) * PH;
  const cut = playIdx;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= cut; i++) {
      const d = Math.abs(x(i) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    onHover(best);
  };

  const ticksX = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  const cursor = hoverIdx ?? cut;

  // Labels aan het eind van elke lijn, zonder overlap.
  const labels = runners
    .map((r) => ({ r, yy: y(vals(r)[cut]) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < labels.length; i++) if (labels[i].yy - labels[i - 1].yy < 16) labels[i].yy = labels[i - 1].yy + 16;

  return (
    <div ref={ref} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="block touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerLeave={() => onHover(null)}
        role="img"
        aria-label="Race van je portefeuille tegen de indexen"
      >
        {sc.ticks.map((tk) => (
          <g key={tk}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tk)} y2={y(tk)} stroke="rgb(var(--border))" strokeWidth="1" />
            <text x={PAD.left} y={y(tk) - 4} fontSize="10" fill="rgb(var(--text-muted))" className="tabular">
              {showPct ? `${Math.round(tk * 100)}%` : tk >= 1000 ? `€${(tk / 1000).toLocaleString('nl-NL', { maximumFractionDigits: tk >= 10000 ? 0 : 1 })}k` : `€${Math.round(tk)}`}
            </text>
          </g>
        ))}
        {ticksX.map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="rgb(var(--text-muted))" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {formatDateShort(days[i])}
          </text>
        ))}
        {[...runners].reverse().map((r) => {
          const v = vals(r);
          const d = v
            .slice(0, cut + 1)
            .map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`)
            .join(' ');
          const me = r.id === 'jij';
          return (
            <g key={r.id}>
              <path d={d} fill="none" stroke={r.color} strokeWidth={me ? 3 : 1.8} strokeLinejoin="round" strokeLinecap="round" opacity={me ? 1 : 0.85} />
              <circle cx={x(cut)} cy={y(v[cut])} r={me ? 5 : 3.5} fill={r.color} stroke="rgb(var(--chart-ring))" strokeWidth="2" />
            </g>
          );
        })}
        {labels.map(({ r, yy }) => (
          <text key={r.id} x={Math.min(x(cut) + 8, W - PAD.right + 4)} y={yy + 4} fontSize="12" fontWeight={r.id === 'jij' ? 800 : 600} fill={r.color}>
            {r.emoji}
          </text>
        ))}
        {hoverIdx !== null && <line x1={x(cursor)} x2={x(cursor)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(var(--border-strong))" strokeDasharray="3 3" />}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {runners.map((r) => (
          <Pill key={r.id}>
            <span className="w-2 h-2 rounded-full" style={{ background: r.color }} aria-hidden="true" />
            {r.label}
          </Pill>
        ))}
      </div>
    </div>
  );
};
