import React, { useMemo, useState } from 'react';
import { LoanProjection, Phase, ymAdd, ymParse } from '../utils/studyLoan.ts';
import { formatEuro } from '../utils/portfolio.ts';
import { niceScale } from '../utils/scale.ts';
import { useElementWidth } from '../hooks/useElementWidth.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';

const PAD = { top: 26, right: 12, bottom: 28, left: 12 };
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const ymLabel = (ym: string) => {
  const { y, m } = ymParse(ym);
  return `${MONTHS[m - 1]} ${y}`;
};

const PHASE_BANDS: { phase: Phase; label: string; color: string }[] = [
  { phase: 'studie', label: 'Studeren en lenen', color: '--series-1' },
  { phase: 'aanloop', label: 'Na je studie', color: '--series-4' },
  { phase: 'aflossen', label: 'Terugbetalen', color: '--series-3' },
];

interface Props {
  /** Volgens het DUO-maandbedrag (zonder extra) */
  base: LoanProjection;
  /** Met extra aflossen; null als er geen extra is */
  extra: LoanProjection | null;
  extraPerMonth: number;
  ageNow: number;
  /** Markering "over 30 jaar" */
  markYm: string;
}

/** Je schuld door de tijd: opbouwen tijdens je studie, rente erbij, en weer aflossen. */
export const StudyLoanChart: React.FC<Props> = ({ base, extra, extraPerMonth, ageNow, markYm }) => {
  const { ref, width: W } = useElementWidth<HTMLDivElement>(640);
  const { hidden } = usePrivacy();
  const H = W < 520 ? 240 : 300;
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const pts = base.months;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const xOf = (t: number) => PAD.left + ((t - t0) / Math.max(1e-9, t1 - t0)) * PW;
    const maxB = Math.max(...pts.map((p) => p.balance), 1);
    const sc = niceScale(0, maxB * 1.05, 4);
    const yOf = (v: number) => PAD.top + PH - (v / sc.hi) * PH;
    const line = (list: { t: number; balance: number }[]) =>
      list.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t).toFixed(1)},${yOf(p.balance).toFixed(1)}`).join(' ');
    const basePath = line(pts);
    const area = `${basePath} L${xOf(t1).toFixed(1)},${yOf(0)} L${xOf(t0).toFixed(1)},${yOf(0)} Z`;
    const extraPath = extra ? line(extra.months) : null;
    // Fasevlakken
    const tOf = (ym: string) => {
      const { y, m } = ymParse(ym);
      return y + (m - 1) / 12;
    };
    const bands = [
      { ...PHASE_BANDS[0], from: t0, to: Math.min(t1, tOf(ymAdd(base.stopYm, 1))) },
      { ...PHASE_BANDS[1], from: tOf(ymAdd(base.stopYm, 1)), to: Math.min(t1, tOf(base.aflosStartYm)) },
      { ...PHASE_BANDS[2], from: tOf(base.aflosStartYm), to: t1 },
    ].filter((b) => b.to > b.from);
    // Jaartallen op de as: elke 5 of 10 jaar
    const span = t1 - t0;
    const step = span > 30 ? 10 : 5;
    const years: number[] = [];
    for (let y = Math.ceil(t0 / step) * step; y <= t1; y += step) years.push(y);
    return { xOf, yOf, ticks: sc.ticks, basePath, area, extraPath, bands, years, t0, t1, tOf };
  }, [base, extra, PW, PH]);

  const pts = base.months;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const t = geo.t0 + ((x - PAD.left) / PW) * (geo.t1 - geo.t0);
    let best = 0;
    for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
    setHover(best);
  };

  const markT = geo.tOf(markYm);
  const showMark = markT > geo.t0 && markT < geo.t1;
  const hp = hover !== null ? pts[hover] : null;
  const hpExtra = hp && extra ? (extra.months.find((m) => m.ym === hp.ym)?.balance ?? 0) : null;

  return (
    <div>
      <div className="min-h-[3.25rem] mb-2" aria-live="polite">
        {hp ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm text-[rgb(var(--text-secondary))]">
              <span className="font-semibold text-[rgb(var(--text-primary))]">{ymLabel(hp.ym)}</span> · je bent{' '}
              {ageNow + (ymParse(hp.ym).y - ymParse(pts[0].ym).y)}
            </p>
            <p className="text-sm">
              <span className="text-[rgb(var(--text-muted))]">Schuld </span>
              <span className="font-bold tabular text-[rgb(var(--text-primary))]">
                <Private>{formatEuro(hp.balance)}</Private>
              </span>
            </p>
            {hpExtra !== null && (
              <p className="text-sm">
                <span className="text-[rgb(var(--text-muted))]">met extra </span>
                <span className="font-bold tabular text-[rgb(var(--series-3))]">
                  <Private>{formatEuro(hpExtra)}</Private>
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-[rgb(var(--text-muted))]">Beweeg over de grafiek (of tik erop) voor je schuld in een bepaald jaar.</p>
        )}
      </div>

      <div ref={ref}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block max-w-full select-none"
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label="Grafiek van je studieschuld door de tijd"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {geo.bands.map((b) => (
            <g key={b.phase}>
              <rect
                x={geo.xOf(b.from)}
                y={PAD.top}
                width={Math.max(0, geo.xOf(b.to) - geo.xOf(b.from))}
                height={PH}
                style={{ fill: `rgb(var(${b.color}))` }}
                opacity={0.07}
              />
              {geo.xOf(b.to) - geo.xOf(b.from) > 70 && (
                <text x={geo.xOf(b.from) + 6} y={PAD.top - 9} fontSize={11} fontWeight={600} style={{ fill: `rgb(var(--text-muted))` }}>
                  {b.label}
                </text>
              )}
            </g>
          ))}

          {geo.ticks.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.yOf(v)} y2={geo.yOf(v)} style={{ stroke: 'rgb(var(--border))' }} strokeWidth={1} />
              {i > 0 && i < geo.ticks.length - 1 && !hidden && (
                <text
                  x={PAD.left + 2}
                  y={geo.yOf(v) - 5}
                  fontSize={11}
                  style={{ fill: 'rgb(var(--text-muted))', stroke: 'rgb(var(--surface))', strokeWidth: 3, paintOrder: 'stroke' }}
                >
                  {formatEuro(v)}
                </text>
              )}
            </g>
          ))}

          {geo.years.map((y) => (
            <text key={y} x={geo.xOf(y)} y={H - 8} fontSize={11} textAnchor="middle" style={{ fill: 'rgb(var(--text-muted))' }}>
              {y}
            </text>
          ))}

          {showMark && (
            <g>
              <line
                x1={geo.xOf(markT)}
                x2={geo.xOf(markT)}
                y1={PAD.top}
                y2={PAD.top + PH}
                style={{ stroke: 'rgb(var(--text-muted))' }}
                strokeDasharray="4,4"
                strokeWidth={1}
              />
              <text
                x={geo.xOf(markT) - 4}
                y={PAD.top + 14}
                fontSize={11}
                textAnchor="end"
                style={{ fill: 'rgb(var(--text-secondary))', stroke: 'rgb(var(--surface))', strokeWidth: 3, paintOrder: 'stroke' }}
              >
                over 30 jaar
              </text>
            </g>
          )}

          <path d={geo.area} style={{ fill: 'rgb(var(--series-1))' }} opacity={0.1} />
          <path d={geo.basePath} fill="none" style={{ stroke: 'rgb(var(--series-1))' }} strokeWidth={2.25} strokeLinejoin="round" />
          {geo.extraPath && (
            <path d={geo.extraPath} fill="none" style={{ stroke: 'rgb(var(--series-3))' }} strokeWidth={2.25} strokeDasharray="6,4" strokeLinejoin="round" />
          )}

          {hp && (
            <g>
              <line
                x1={geo.xOf(hp.t)}
                x2={geo.xOf(hp.t)}
                y1={PAD.top}
                y2={PAD.top + PH}
                style={{ stroke: 'rgb(var(--border-strong))' }}
                strokeWidth={1}
              />
              <circle cx={geo.xOf(hp.t)} cy={geo.yOf(hp.balance)} r={4.5} style={{ fill: 'rgb(var(--series-1))', stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />
              {hpExtra !== null && (
                <circle cx={geo.xOf(hp.t)} cy={geo.yOf(hpExtra)} r={4.5} style={{ fill: 'rgb(var(--series-3))', stroke: 'rgb(var(--chart-ring))' }} strokeWidth={2} />
              )}
            </g>
          )}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[rgb(var(--text-secondary))]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded bg-[rgb(var(--series-1))]" aria-hidden="true" />
          Volgens het DUO-maandbedrag
        </span>
        {extra && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 h-0 border-t-2 border-dashed border-[rgb(var(--series-3))]" aria-hidden="true" />
            Met <Private>{formatEuro(extraPerMonth)}</Private> extra per maand
          </span>
        )}
      </div>
    </div>
  );
};
