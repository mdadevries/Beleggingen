import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Target, TrendingUp, Coins, Sparkles } from 'lucide-react';
import { Card } from './Card.tsx';
import { PageHeader, Segmented, useCountUp } from './ui.tsx';
import { simulateFuture, FutureInput, FutureYear } from '../utils/future.ts';
import { formatEuro } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';
import { useElementWidth } from '../hooks/useElementWidth.ts';
import { niceScale } from '../utils/scale.ts';

interface Props {
  currentValue: number;
  /** Schommeling van jouw portefeuille per jaar (uit de echte koershistorie), indien bekend */
  myVolatility: number | null;
}

type Scenario = 'voorzichtig' | 'gemiddeld' | 'optimistisch' | 'eigen';
const SCENARIOS: Record<Exclude<Scenario, 'eigen'>, number> = { voorzichtig: 0.04, gemiddeld: 0.07, optimistisch: 0.1 };
const STORAGE_KEY = 'beleggingen_future';

interface Settings {
  start: number | null;
  monthly: number;
  monthlyGrowth: number;
  years: number;
  scenario: Scenario;
  custom: number;
  volatility: number | null;
  inflation: boolean;
  goal: number;
}

const DEFAULTS: Settings = { start: null, monthly: 150, monthlyGrowth: 0.02, years: 20, scenario: 'gemiddeld', custom: 0.08, volatility: null, inflation: true, goal: 100_000 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* negeren */
  }
  return DEFAULTS;
}

const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const euroShort = (v: number) =>
  v >= 1e6 ? `€${(v / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : v >= 1000 ? `€${Math.round(v / 1000).toLocaleString('nl-NL')}k` : `€${Math.round(v)}`;

export const FuturePage: React.FC<Props> = ({ currentValue, myVolatility }) => {
  const { hidden } = usePrivacy();
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* negeren */
    }
  }, [s]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const start = s.start ?? Math.round(currentValue);
  const vol = s.volatility ?? Math.min(0.4, Math.max(0.1, myVolatility ?? 0.18));
  const expected = s.scenario === 'eigen' ? s.custom : SCENARIOS[s.scenario];
  const input: FutureInput = { start, monthly: s.monthly, monthlyGrowth: s.monthlyGrowth, years: s.years, expected, volatility: vol, inflation: s.inflation ? 0.02 : 0 };
  const deferred = useDeferredValue(input);
  const key = JSON.stringify(deferred);
  const result = useMemo(() => simulateFuture(deferred), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const extra = useMemo(() => simulateFuture({ ...deferred, monthly: deferred.monthly + 50, paths: 600 }), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = result.years[result.years.length - 1];
  const goal = result.reachYear(s.goal);
  const median = useCountUp(last.p50, 900);
  const growth = Math.max(0, last.p50 - last.contributed);
  const extraGain = extra.years[extra.years.length - 1].p50 - last.p50;

  return (
    <>
      <PageHeader
        emoji="🔮"
        title="Toekomstmachine"
        subtitle="Duizend-en-een mogelijke toekomsten voor je portefeuille. Schuif aan de knoppen en kijk wat rente-op-rente doet."
      />

      {/* Uitkomst */}
      <section className="relative overflow-hidden rounded-2xl p-5 sm:p-7 text-white bg-gradient-to-br from-[#0f172a] via-[#312e81] to-[#7c3aed]">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #fff2 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, #fff3 0 1px, transparent 2px)', backgroundSize: '60px 60px, 40px 40px' }} />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">In {last.year}, waarschijnlijk</p>
          <p className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white tabular mt-1">
            <Private>{formatEuro(median)}</Private>
          </p>
          <p className="text-sm text-white/80 mt-2 max-w-xl">
            8 van de 10 toekomsten eindigen tussen{' '}
            <b className="text-white">
              <Private>{euroShort(last.p10)}</Private>
            </b>{' '}
            en{' '}
            <b className="text-white">
              <Private>{euroShort(last.p90)}</Private>
            </b>
            {s.inflation ? ' (in euro\'s van nu, dus al gecorrigeerd voor 2% inflatie).' : '.'}
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" aria-hidden="true" /> Zelf ingelegd
              </p>
              <p className="text-lg font-bold tabular">
                <Private>{euroShort(last.contributed)}</Private>
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> Rente-op-rente
              </p>
              <p className="text-lg font-bold tabular text-emerald-300">
                +<Private>{euroShort(growth)}</Private>
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-3 backdrop-blur col-span-2 sm:col-span-1">
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                <Target className="w-3.5 h-3.5" aria-hidden="true" /> Doel <Private>{euroShort(s.goal)}</Private>
              </p>
              <p className="text-lg font-bold tabular">
                {Math.round(goal.chance * 100)}% kans{goal.median ? <span className="text-sm font-semibold text-white/75"> · rond {goal.median}</span> : null}
              </p>
            </div>
          </div>
          {/* Verdeling ingelegd vs groei */}
          <div className="mt-4 h-2.5 rounded-full bg-white/15 overflow-hidden flex" aria-hidden="true">
            <div className="h-full bg-white/70" style={{ width: `${(last.contributed / Math.max(1, last.p50)) * 100}%` }} />
            <div className="h-full bg-emerald-400" style={{ width: `${(growth / Math.max(1, last.p50)) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-white/70">
            Wit = jouw eigen inleg · groen = wat je geld voor je verdient ({Math.round((growth / Math.max(1, last.p50)) * 100)}% van de eindwaarde)
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <Card title="Alle mogelijke toekomsten" subtitle="Donkere band: de middelste helft. Lichte band: 8 van de 10. De lijn: het midden. Gestippeld: wat je zelf inlegt.">
          <FanChart years={result.years} hideAxis={hidden} goal={s.goal} />
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {MILESTONES.map((m) => {
              const r = result.reachYear(m);
              return (
                <div key={m} className={`rounded-xl border p-2 text-center ${r.median ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[rgb(var(--border))] opacity-60'}`}>
                  <p className="text-xs font-bold text-[rgb(var(--text-primary))]">
                    <Private>{euroShort(m)}</Private>
                  </p>
                  <p className="text-[11px] tabular text-[rgb(var(--text-muted))]">{r.median ?? `${Math.round(r.chance * 100)}%`}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[rgb(var(--text-muted))]">Per mijlpaal: het jaar waarin je hem in de helft van de toekomsten bereikt (of de kans, als dat niet lukt).</p>
        </Card>

        <Card title="Knoppen">
          <div className="space-y-5">
            <Field label="Startbedrag" value={<Private>{formatEuro(start)}</Private>}>
              <input
                type="range"
                min={0}
                max={Math.max(50_000, Math.round(currentValue * 3))}
                step={100}
                value={start}
                onChange={(e) => set('start', Number(e.target.value))}
                className="w-full accent-[#7c3aed]"
                aria-label="Startbedrag"
              />
              {s.start !== null && (
                <button type="button" className="text-[11px] text-[rgb(var(--accent-text))] font-semibold" onClick={() => set('start', null)}>
                  Terug naar je huidige waarde
                </button>
              )}
            </Field>
            <Field label="Elke maand inleggen" value={<Private>{formatEuro(s.monthly)}</Private>}>
              <input type="range" min={0} max={1500} step={10} value={s.monthly} onChange={(e) => set('monthly', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Maandinleg" />
            </Field>
            <Field label="Inleg elk jaar verhogen met" value={`${Math.round(s.monthlyGrowth * 100)}%`}>
              <input type="range" min={0} max={0.08} step={0.01} value={s.monthlyGrowth} onChange={(e) => set('monthlyGrowth', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Jaarlijkse verhoging" />
            </Field>
            <Field label="Hoe lang" value={`${s.years} jaar (tot ${new Date().getFullYear() + s.years})`}>
              <input type="range" min={1} max={45} step={1} value={s.years} onChange={(e) => set('years', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Aantal jaren" />
            </Field>
            <div>
              <p className="text-xs font-semibold text-[rgb(var(--text-secondary))] mb-1.5">Rendement per jaar (gemiddeld)</p>
              <Segmented
                label="Scenario"
                value={s.scenario}
                onChange={(v) => set('scenario', v)}
                options={[
                  { id: 'voorzichtig', label: '4%' },
                  { id: 'gemiddeld', label: '7%' },
                  { id: 'optimistisch', label: '10%' },
                  { id: 'eigen', label: 'Eigen' },
                ]}
              />
              {s.scenario === 'eigen' && (
                <Field label="Eigen rendement" value={`${(s.custom * 100).toFixed(1).replace('.', ',')}%`}>
                  <input type="range" min={0} max={0.15} step={0.005} value={s.custom} onChange={(e) => set('custom', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Eigen rendement" />
                </Field>
              )}
              <p className="text-[11px] text-[rgb(var(--text-muted))] mt-1.5">Ter vergelijking: wereldwijde aandelen deden over lange periodes zo'n 7 à 8% per jaar vóór inflatie, met flinke uitschieters naar boven én beneden.</p>
            </div>
            <Field label="Schommeling (risico)" value={`${Math.round(vol * 100)}%`}>
              <input type="range" min={0.05} max={0.45} step={0.01} value={vol} onChange={(e) => set('volatility', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Schommeling" />
              <p className="text-[11px] text-[rgb(var(--text-muted))]">
                {myVolatility ? `Jouw portefeuille schommelde de afgelopen periode zo'n ${Math.round(myVolatility * 100)}% per jaar.` : 'Een brede wereld-ETF schommelt zo\'n 15% per jaar.'}
                {s.volatility !== null && (
                  <button type="button" className="ml-1 text-[rgb(var(--accent-text))] font-semibold" onClick={() => set('volatility', null)}>
                    Reset
                  </button>
                )}
              </p>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.inflation} onChange={(e) => set('inflation', e.target.checked)} className="w-4 h-4 accent-[#7c3aed]" />
              Rekenen in euro's van nu (2% inflatie)
            </label>
            <Field label="Mijn doel" value={<Private>{formatEuro(s.goal)}</Private>}>
              <input type="range" min={5000} max={1_000_000} step={5000} value={s.goal} onChange={(e) => set('goal', Number(e.target.value))} className="w-full accent-[#7c3aed]" aria-label="Doelbedrag" />
            </Field>
          </div>
        </Card>
      </div>

      <section className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 flex gap-4 items-start">
        <span className="text-3xl" aria-hidden="true">
          ☕
        </span>
        <div>
          <p className="font-bold text-[rgb(var(--text-primary))] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#7c3aed]" aria-hidden="true" /> €50 per maand extra?
          </p>
          <p className="text-sm mt-1">
            Dat is ongeveer één keer per maand uit eten minder. In {last.year} scheelt het in het midden van alle toekomsten{' '}
            <b className="text-[rgb(var(--status-good))]">
              +<Private>{euroShort(Math.max(0, extraGain))}</Private>
            </b>
            , terwijl je zelf maar{' '}
            <b className="text-[rgb(var(--text-primary))]">
              <Private>{euroShort(50 * 12 * s.years)}</Private>
            </b>{' '}
            extra inlegt.
          </p>
        </div>
      </section>

      <p className="text-xs text-[rgb(var(--text-muted))] px-1">
        Een rekenmodel, geen voorspelling of advies. Echte beurzen hebben soms jaren van tegenwind, en kosten en belasting (box 3) zitten hier niet in.
      </p>
    </>
  );
};

const Field: React.FC<{ label: string; value: React.ReactNode; children: React.ReactNode }> = ({ label, value, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-semibold text-[rgb(var(--text-secondary))]">{label}</span>
      <span className="text-sm font-bold tabular text-[rgb(var(--text-primary))]">{value}</span>
    </div>
    {children}
  </div>
);

const FanChart: React.FC<{ years: FutureYear[]; hideAxis: boolean; goal: number }> = ({ years, hideAxis, goal }) => {
  const { ref, width: W } = useElementWidth<HTMLDivElement>();
  const H = W < 520 ? 240 : 300;
  const PAD = { top: 14, right: 12, bottom: 24, left: hideAxis ? 12 : 52 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;
  const [hover, setHover] = useState<number | null>(null);
  const hi0 = Math.max(...years.map((y) => y.p90), goal * 0.6);
  const sc = niceScale(0, hi0, 4);
  const x = (i: number) => PAD.left + (i / Math.max(1, years.length - 1)) * PW;
  const y = (v: number) => PAD.top + PH - (Math.min(v, sc.hi) / sc.hi) * PH;
  const band = (a: keyof FutureYear, b: keyof FutureYear) =>
    years.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[a] as number)}`).join(' ') +
    ' ' +
    [...years]
      .map((p, i) => ({ p, i }))
      .reverse()
      .map(({ p, i }) => `L${x(i)},${y(p[b] as number)}`)
      .join(' ') +
    ' Z';
  const line = (k: keyof FutureYear) => years.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[k] as number)}`).join(' ');
  const hi = hover ?? years.length - 1;
  const pt = years[hi];

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between text-xs mb-1 tabular">
        <span className="font-bold text-[rgb(var(--text-primary))]">{pt.year}</span>
        <span className="text-[rgb(var(--text-muted))]">
          midden <b className="text-[#7c3aed]"><Private>{euroShort(pt.p50)}</Private></b> · <Private>{euroShort(pt.p10)}</Private>–<Private>{euroShort(pt.p90)}</Private>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="block touch-pan-y"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.max(0, Math.min(years.length - 1, Math.round(((px - PAD.left) / PW) * (years.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Waaier van mogelijke uitkomsten"
      >
        <defs>
          <linearGradient id="fanfade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7c3aed" stopOpacity="0.28" />
            <stop offset="1" stopColor="#7c3aed" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        {sc.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="rgb(var(--border))" />
            {!hideAxis && (
              <text x={PAD.left - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="rgb(var(--text-muted))">
                {euroShort(t)}
              </text>
            )}
          </g>
        ))}
        {goal <= sc.hi && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} stroke="#1baf7a" strokeDasharray="5 4" />
            <text x={W - PAD.right - 2} y={y(goal) - 4} fontSize="10" textAnchor="end" fill="#1baf7a" fontWeight="700">
              🎯 doel
            </text>
          </g>
        )}
        <path d={band('p90', 'p10')} fill="url(#fanfade)" />
        <path d={band('p75', 'p25')} fill="#7c3aed" fillOpacity="0.28" />
        <path d={line('contributed')} fill="none" stroke="rgb(var(--text-muted))" strokeDasharray="4 4" strokeWidth="1.5" />
        <path d={line('p50')} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" />
        <line x1={x(hi)} x2={x(hi)} y1={PAD.top} y2={H - PAD.bottom} stroke="rgb(var(--border-strong))" strokeDasharray="3 3" />
        <circle cx={x(hi)} cy={y(pt.p50)} r="5" fill="#7c3aed" stroke="rgb(var(--chart-ring))" strokeWidth="2" />
        {[0, Math.floor((years.length - 1) / 2), years.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="10" fill="rgb(var(--text-muted))" textAnchor={i === 0 ? 'start' : i === years.length - 1 ? 'end' : 'middle'}>
            {years[i].year}
          </text>
        ))}
      </svg>
    </div>
  );
};
