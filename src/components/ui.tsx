import React, { useEffect, useRef, useState } from 'react';

/** Kleine lijngrafiek zonder assen. Meerdere lijnen worden op dezelfde schaal getekend. */
export const Sparkline: React.FC<{
  lines: { values: number[]; color: string; width?: number; dashed?: boolean }[];
  height?: number;
  className?: string;
  baseline?: number;
}> = ({ lines, height = 44, className = '', baseline }) => {
  const W = 200;
  const all = lines.flatMap((l) => l.values);
  if (baseline !== undefined) all.push(baseline);
  if (all.length < 2) return <div style={{ height }} className={className} />;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const y = (v: number) => 3 + (height - 6) * (1 - (v - lo) / span);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={`w-full block ${className}`} style={{ height }} aria-hidden="true">
      {baseline !== undefined && (
        <line x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} stroke="rgb(var(--border-strong))" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
      {lines.map((l, i) => {
        if (l.values.length < 2) return null;
        const d = l.values.map((v, k) => `${k ? 'L' : 'M'}${((k / (l.values.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={l.color}
            strokeWidth={l.width ?? 2}
            strokeDasharray={l.dashed ? '4 3' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
};

/** Telt op naar een getal (respecteert "minder beweging"). */
export function useCountUp(target: number, duration = 1100, start = true) {
  const [v, setV] = useState(start ? 0 : target);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!start) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setV(target);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const f = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - f, 3);
      setV(target * eased);
      if (f < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration, start]);
  return v;
}

/** Ronde score-meter (0-100). */
export const ScoreRing: React.FC<{ score: number; size?: number; label?: string }> = ({ score, size = 132, label }) => {
  const v = useCountUp(score);
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? '#1baf7a' : score >= 55 ? '#eda100' : '#d03b3b';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--border))" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-[rgb(var(--text-primary))] tabular">{Math.round(v)}</span>
        {label && <span className="text-[11px] font-semibold text-[rgb(var(--text-muted))] -mt-0.5">{label}</span>}
      </div>
    </div>
  );
};

/** Horizontale balk met label en percentage. */
export const BarRow: React.FC<{ label: string; value: number; color?: string; max?: number; hint?: string }> = ({ label, value, color = 'rgb(var(--series-1))', max = 1, hint }) => (
  <div>
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-[rgb(var(--text-primary))] font-medium truncate">{label}</span>
      <span className="tabular text-[rgb(var(--text-secondary))] font-semibold">{Math.round(value * 100)}%</span>
    </div>
    <div className="mt-1 h-2 rounded-full bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] overflow-hidden">
      <div className="h-full rounded-full reveal-rect" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }} />
    </div>
    {hint && <p className="text-[11px] text-[rgb(var(--text-muted))] mt-0.5">{hint}</p>}
  </div>
);

export const Pill: React.FC<{ children: React.ReactNode; tone?: 'good' | 'bad' | 'ok' | 'neutral' | 'accent'; className?: string }> = ({ children, tone = 'neutral', className = '' }) => {
  const tones = {
    good: 'bg-emerald-500/10 text-[rgb(var(--status-good))]',
    bad: 'bg-red-500/10 text-[rgb(var(--status-critical))]',
    ok: 'bg-amber-500/15 text-[rgb(var(--banner-text))]',
    neutral: 'bg-[rgb(var(--surface-sunken))] text-[rgb(var(--text-secondary))] border border-[rgb(var(--border))]',
    accent: 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]',
  } as const;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>;
};

/** Grote kop bovenaan een pagina. */
export const PageHeader: React.FC<{ emoji?: string; title: string; subtitle?: string; action?: React.ReactNode }> = ({ emoji, title, subtitle, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[rgb(var(--text-primary))]">
        {emoji && <span className="mr-2" aria-hidden="true">{emoji}</span>}
        {title}
      </h1>
      {subtitle && <p className="text-sm text-[rgb(var(--text-muted))] mt-1 max-w-2xl">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex p-0.5 rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] max-w-full overflow-x-auto">
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        role="radio"
        aria-checked={value === o.id}
        onClick={() => onChange(o.id)}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
          value === o.id ? 'bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] shadow-sm' : 'text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-secondary))]'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
