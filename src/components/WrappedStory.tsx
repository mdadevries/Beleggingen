import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Share2, ChevronLeft, ChevronRight } from 'lucide-react';
import { SeriesPoint, Stock, StockPosition, Transaction } from '../data/types.ts';
import { Points } from '../utils/history.ts';
import { computeWrapped, WrappedData } from '../utils/wrapped.ts';
import { formatDate, formatEuro, formatPercent } from '../utils/portfolio.ts';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';
import { useCountUp } from './ui.tsx';

interface Props {
  stocks: Stock[];
  transactions: Transaction[];
  positions: StockPosition[];
  series: SeriesPoint[];
  benchmarks: Record<string, Points>;
  onClose: () => void;
}

interface Slide {
  id: string;
  bg: string;
  render: (active: boolean) => React.ReactNode;
}

const DURATION = 6500;

const Big: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className = '', delay = 0 }) => (
  <div className={`wrapped-pop ${className}`} style={{ animationDelay: `${delay}ms` }}>
    {children}
  </div>
);

const Count: React.FC<{ value: number; active: boolean; format: (v: number) => string }> = ({ value, active, format }) => {
  const v = useCountUp(value, 1400, active);
  return <>{format(active ? v : value)}</>;
};

export const WrappedStory: React.FC<Props> = ({ stocks, transactions, positions, series, benchmarks, onClose }) => {
  const { hidden } = usePrivacy();
  const years = useMemo(() => [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a), [transactions]);
  const [year, setYear] = useState<number | 'alles'>(years[0] ?? 'alles');
  const data = useMemo(() => computeWrapped(year, stocks, transactions, positions, series, benchmarks), [year, stocks, transactions, positions, series, benchmarks]);
  const slides = useMemo(() => buildSlides(data, year, years, setYear, hidden), [data, year, years, hidden]);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const raf = useRef(0);
  const last = useRef(performance.now());
  const elapsedRef = useRef(0);

  const go = useCallback(
    (d: number) => {
      elapsedRef.current = 0;
      setElapsed(0);
      const n = i + d;
      if (n >= slides.length) onClose();
      else setI(Math.max(0, n));
    },
    [i, slides.length, onClose]
  );

  useEffect(() => {
    last.current = performance.now();
    const tick = (t: number) => {
      const dt = t - last.current;
      last.current = t;
      if (!paused && i < slides.length - 1) {
        elapsedRef.current += dt;
        if (elapsedRef.current >= DURATION) {
          elapsedRef.current = 0;
          setI((x) => Math.min(slides.length - 1, x + 1));
        }
        setElapsed(elapsedRef.current);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [paused, i, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  const slide = slides[Math.min(i, slides.length - 1)];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Jouw beleggings-Wrapped">
      <div className={`relative w-full h-full sm:h-[min(92vh,820px)] sm:max-w-[440px] sm:rounded-3xl overflow-hidden text-white ${slide.bg} transition-[background] duration-700`}>
        {/* Achtergrond-blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/10 blur-3xl wrapped-float" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-black/20 blur-3xl wrapped-float" style={{ animationDelay: '1.5s' }} />

        {/* Voortgang */}
        <div className="absolute top-0 inset-x-0 p-3 pt-[max(12px,env(safe-area-inset-top))] z-20">
          <div className="flex gap-1">
            {slides.map((s, k) => (
              <div key={s.id} className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full bg-white" style={{ width: k < i ? '100%' : k === i ? `${(elapsed / DURATION) * 100}%` : '0%' }} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-white/80">Beleggings-Wrapped · {data.label}</span>
            <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/15" aria-label="Sluiten">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Tikzones */}
        <button type="button" className="absolute left-0 top-16 bottom-0 w-1/3 z-10 focus-visible:outline-none" onClick={() => go(-1)} aria-label="Vorige" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />
        <button type="button" className="absolute right-0 top-16 bottom-0 w-2/3 z-10 focus-visible:outline-none" onClick={() => go(1)} aria-label="Volgende" onPointerDown={() => setPaused(true)} onPointerUp={() => setPaused(false)} />

        <div key={slide.id + String(year)} className="relative h-full flex flex-col justify-center px-7 pt-20 pb-14">
          {slide.render(true)}
        </div>

        <div className="hidden sm:flex absolute bottom-4 inset-x-0 justify-center gap-2 z-20">
          <button type="button" onClick={() => go(-1)} className="p-2 rounded-full bg-white/15 hover:bg-white/25" aria-label="Vorige">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} className="p-2 rounded-full bg-white/15 hover:bg-white/25" aria-label="Volgende">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};

function buildSlides(d: WrappedData, year: number | 'alles', years: number[], setYear: (y: number | 'alles') => void, hidden: boolean): Slide[] {
  const slides: Slide[] = [];
  const pctTxt = (v: number) => formatPercent(v);

  slides.push({
    id: 'intro',
    bg: 'bg-gradient-to-br from-[#1f2937] via-[#312e81] to-[#db2777]',
    render: () => (
      <>
        <Big className="text-6xl">✨</Big>
        <Big delay={150} className="text-4xl font-black leading-tight mt-4">
          Jouw beleggings&shy;jaar {year === 'alles' ? 'tot nu toe' : year}
        </Big>
        <Big delay={350} className="text-white/80 mt-3 text-lg">
          Tik rechts om verder te gaan, links om terug. Klaar voor je cijfers?
        </Big>
        <div className="relative z-20 mt-6 flex flex-wrap gap-2">
          {[...years, 'alles' as const].map((y) => (
            <button
              key={y}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setYear(y);
              }}
              className={`px-3 py-1.5 rounded-full text-sm font-bold ${y === year ? 'bg-white text-[#312e81]' : 'bg-white/15 hover:bg-white/25'}`}
            >
              {y === 'alles' ? 'Alles' : y}
            </button>
          ))}
        </div>
      </>
    ),
  });

  slides.push({
    id: 'count',
    bg: 'bg-gradient-to-br from-[#0f766e] via-[#059669] to-[#a3e635]',
    render: (a) => (
      <>
        <Big className="text-xl font-bold text-white/85">Je drukte</Big>
        <Big delay={120} className="text-[110px] leading-none font-black tabular my-2">
          <Count value={d.txCount} active={a} format={(v) => String(Math.round(v))} />
        </Big>
        <Big delay={240} className="text-2xl font-extrabold">keer op de knop.</Big>
        <Big delay={420} className="mt-4 text-white/85 text-lg">
          {d.buys} keer gekocht, {d.sells} keer verkocht.
          {d.busiestMonth && (
            <>
              {' '}
              In <b>{d.busiestMonth.name}</b> was je het drukst ({d.busiestMonth.count}×)
            </>
          )}
          {d.favoriteWeekday && <>, en je favoriete handelsdag is de <b>{d.favoriteWeekday}</b>.</>}
        </Big>
      </>
    ),
  });

  if (d.invested > 0) {
    slides.push({
      id: 'invested',
      bg: 'bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#22d3ee]',
      render: (a) => (
        <>
          <Big className="text-xl font-bold text-white/85">Je stopte</Big>
          <Big delay={120} className="text-6xl font-black tabular my-3 break-words">
            {hidden ? <Private>x</Private> : <Count value={d.invested} active={a} format={(v) => formatEuro(v)} />}
          </Big>
          <Big delay={260} className="text-2xl font-extrabold">aan het werk op de beurs.</Big>
          {d.newStocks.length > 0 && (
            <Big delay={450} className="mt-5">
              <p className="text-white/80 text-sm font-semibold uppercase tracking-wider">Nieuw in je portefeuille</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {d.newStocks.slice(0, 8).map((n) => (
                  <span key={n} className="px-2.5 py-1 rounded-full bg-white/15 text-sm font-semibold">
                    {n}
                  </span>
                ))}
              </div>
            </Big>
          )}
        </>
      ),
    });
  }

  if (d.best) {
    slides.push({
      id: 'best',
      bg: 'bg-gradient-to-br from-[#78350f] via-[#d97706] to-[#fde047]',
      render: (a) => (
        <>
          <Big className="text-7xl">🏆</Big>
          <Big delay={150} className="text-xl font-bold text-white/90 mt-4">Je MVP</Big>
          <Big delay={250} className="text-5xl font-black leading-tight mt-1">{d.best!.name}</Big>
          <Big delay={400} className="text-6xl font-black tabular mt-3">
            <Count value={d.best!.pct} active={a} format={pctTxt} />
          </Big>
          <Big delay={550} className="text-white/85 mt-2 text-lg">sinds je instapte. Dit aandeel droeg je portefeuille.</Big>
        </>
      ),
    });
  }

  if (d.worst && d.worst.ticker !== d.best?.ticker) {
    slides.push({
      id: 'worst',
      bg: 'bg-gradient-to-br from-[#111827] via-[#374151] to-[#6b7280]',
      render: () => (
        <>
          <Big className="text-7xl">🫠</Big>
          <Big delay={150} className="text-xl font-bold text-white/90 mt-4">De pechvogel</Big>
          <Big delay={250} className="text-5xl font-black leading-tight mt-1">{d.worst!.name}</Big>
          <Big delay={400} className="text-6xl font-black tabular mt-3">{pctTxt(d.worst!.pct)}</Big>
          <Big delay={550} className="text-white/80 mt-2 text-lg">
            {d.worst!.pct < 0 ? 'Nog niet waar je hoopte. Lange termijn, toch?' : 'Zelfs je "slechtste" staat in de plus. Lekker.'}
          </Big>
        </>
      ),
    });
  }

  if (d.bestBuy) {
    slides.push({
      id: 'timing',
      bg: 'bg-gradient-to-br from-[#4c1d95] via-[#7c3aed] to-[#f472b6]',
      render: () => (
        <>
          <Big className="text-7xl">🎯</Big>
          <Big delay={150} className="text-xl font-bold text-white/90 mt-4">Je beste timing</Big>
          <Big delay={250} className="text-3xl font-black leading-tight mt-2">
            {d.bestBuy!.name} op {formatDate(d.bestBuy!.date)}
          </Big>
          <Big delay={400} className="text-white/85 text-lg mt-2">
            gekocht voor {formatEuro(d.bestBuy!.price)} per stuk. Nu:
          </Big>
          <Big delay={550} className="text-6xl font-black tabular mt-2">{pctTxt(d.bestBuy!.pct)}</Big>
        </>
      ),
    });
  }

  if (d.loyal) {
    slides.push({
      id: 'loyal',
      bg: 'bg-gradient-to-br from-[#9f1239] via-[#e11d48] to-[#fb923c]',
      render: () => (
        <>
          <Big className="text-7xl">❤️</Big>
          <Big delay={150} className="text-xl font-bold text-white/90 mt-4">Je trouwste liefde</Big>
          <Big delay={250} className="text-5xl font-black leading-tight mt-1">{d.loyal!.name}</Big>
          <Big delay={400} className="text-2xl font-extrabold mt-3">{d.loyal!.count} keer bijgekocht.</Big>
          <Big delay={550} className="text-white/80 mt-2 text-lg">Jij gelooft er echt in.</Big>
        </>
      ),
    });
  }

  if (d.vsMarket) {
    const won = d.vsMarket.mine >= d.vsMarket.theirs;
    slides.push({
      id: 'market',
      bg: won ? 'bg-gradient-to-br from-[#064e3b] via-[#10b981] to-[#6ee7b7]' : 'bg-gradient-to-br from-[#7f1d1d] via-[#dc2626] to-[#f97316]',
      render: () => (
        <>
          <Big className="text-7xl">{won ? '🚀' : '🐢'}</Big>
          <Big delay={150} className="text-xl font-bold text-white/90 mt-4">Jij vs de {d.vsMarket!.label}</Big>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Big delay={250} className="rounded-2xl bg-white/15 p-4">
              <p className="text-sm text-white/80">Jij</p>
              <p className="text-3xl font-black tabular">{pctTxt(d.vsMarket!.mine)}</p>
            </Big>
            <Big delay={380} className="rounded-2xl bg-black/15 p-4">
              <p className="text-sm text-white/80">{d.vsMarket!.label}</p>
              <p className="text-3xl font-black tabular">{pctTxt(d.vsMarket!.theirs)}</p>
            </Big>
          </div>
          <Big delay={550} className="text-2xl font-extrabold mt-5">{won ? 'Je versloeg de markt! 🎉' : 'De markt was je dit keer te snel af.'}</Big>
        </>
      ),
    });
  }

  slides.push({
    id: 'type',
    bg: 'bg-gradient-to-br from-[#0c4a6e] via-[#0284c7] to-[#a78bfa]',
    render: () => (
      <>
        <Big className="text-xl font-bold text-white/90">Je beleggerstype is…</Big>
        <Big delay={300} className="text-[96px] leading-none mt-4">{d.type.emoji}</Big>
        <Big delay={500} className="text-5xl font-black leading-tight mt-3">{d.type.title}</Big>
        <Big delay={700} className="text-white/85 mt-3 text-lg">{d.type.text}</Big>
      </>
    ),
  });

  slides.push({
    id: 'outro',
    bg: 'bg-gradient-to-br from-[#1f2937] via-[#312e81] to-[#db2777]',
    render: () => {
      const text = [
        `Mijn beleggings-Wrapped ${d.label} ✨`,
        `${d.txCount} transacties · ${d.positions} posities`,
        d.best ? `MVP: ${d.best.name} (${pctTxt(d.best.pct)})` : '',
        d.vsMarket ? `Jij ${pctTxt(d.vsMarket.mine)} vs ${d.vsMarket.label} ${pctTxt(d.vsMarket.theirs)}` : '',
        `Type: ${d.type.title} ${d.type.emoji}`,
      ]
        .filter(Boolean)
        .join('\n');
      return (
        <>
          <Confetti />
          <Big className="text-4xl font-black">Dat was 'm!</Big>
          <Big delay={200} className="mt-5 rounded-3xl bg-white/12 backdrop-blur p-5 space-y-2 text-lg">
            <p>📈 {d.txCount} transacties</p>
            {d.best && (
              <p>
                🏆 {d.best.name} <b className="tabular">{pctTxt(d.best.pct)}</b>
              </p>
            )}
            {d.vsMarket && (
              <p>
                🏁 Jij <b className="tabular">{pctTxt(d.vsMarket.mine)}</b> vs {d.vsMarket.label} <b className="tabular">{pctTxt(d.vsMarket.theirs)}</b>
              </p>
            )}
            <p>
              {d.type.emoji} {d.type.title}
            </p>
          </Big>
          <Big delay={450} className="relative z-20 mt-6">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (navigator.share) navigator.share({ text }).catch(() => undefined);
                else navigator.clipboard?.writeText(text).catch(() => undefined);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#312e81] px-5 py-3 font-bold"
            >
              <Share2 className="w-4 h-4" aria-hidden="true" /> Delen (zonder bedragen)
            </button>
          </Big>
        </>
      );
    },
  });

  return slides;
}

const Confetti: React.FC = () => {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, k) => ({
        left: (k * 37) % 100,
        delay: (k % 9) * 0.25,
        color: ['#fde047', '#f472b6', '#60a5fa', '#34d399', '#fb923c'][k % 5],
        rot: (k * 47) % 360,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p, k) => (
        <span key={k} className="confetti" style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, background: p.color, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
};
