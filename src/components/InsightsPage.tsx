import React, { useMemo, useState } from 'react';
import { Swords, Trophy, Lightbulb, RefreshCw, Sparkles, AlertTriangle, MapPin, ChevronDown, Bot } from 'lucide-react';
import { StockPosition, Transaction } from '../data/types.ts';
import { Card } from './Card.tsx';
import { BarRow, PageHeader, Pill, ScoreRing, Sparkline } from './ui.tsx';
import { computeExposure, healthScore, investorType, REGIONS, SECTORS } from '../utils/analysis.ts';
import { rankIdeas, Idea } from '../utils/ideas.ts';
import { findPeer } from '../data/peers.ts';
import { usePeerHistories } from '../hooks/useHistories.ts';
import { useSymbolFundamentals } from '../hooks/useSymbolFundamentals.ts';
import { Points, peerDuel, priceOnOrFirst, sampleValues } from '../utils/history.ts';
import { shortName } from '../utils/names.ts';
import { formatPercent } from '../utils/portfolio.ts';
import { Fundamentals } from '../hooks/useStockData.ts';

interface Props {
  positions: StockPosition[];
  transactions: Transaction[];
  histories: Record<string, Points>;
  benchmarks: Record<string, Points>;
  isDemo: boolean;
  onSelectStock: (ticker: string) => void;
  onAskAi: (question: string) => void;
}

const REGION_COLORS: Record<string, string> = { VS: '#2a78d6', Europa: '#eda100', Azië: '#e87ba4', Opkomend: '#1baf7a', Overig: '#a8a79e' };
const SECTOR_COLORS = ['#2a78d6', '#8b5cf6', '#eb6834', '#1baf7a', '#e87ba4', '#eda100', '#d03b3b', '#a8a79e'];

export const InsightsPage: React.FC<Props> = ({ positions, transactions, histories, benchmarks, isDemo, onSelectStock, onAskAi }) => {
  const exposure = useMemo(() => computeExposure(positions), [positions]);
  const health = useMemo(() => healthScore(exposure), [exposure]);
  const months = useMemo(() => {
    if (transactions.length < 2) return 1;
    const ds = transactions.map((t) => t.date).sort();
    return Math.max(1, (Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / (30.4 * 86_400_000));
  }, [transactions]);
  const type = investorType(exposure, transactions.length, months);

  return (
    <>
      <PageHeader
        emoji="🔬"
        title="Inzicht"
        subtitle="Hoe stevig je portefeuille in elkaar zit, of je keuzes beter uitpakten dan de concurrent, en drie ideeën om verder te onderzoeken."
      />

      {/* Score */}
      <section className="relative overflow-hidden rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-gradient-to-br from-[#2a78d6]/20 to-[#1baf7a]/10 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row gap-6 sm:items-center">
          <ScoreRing score={health.total} label="van 100" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--text-muted))]">Portefeuillescore</p>
            <h2 className="text-2xl font-extrabold mt-0.5">{health.label}</h2>
            <p className="mt-2 text-sm">
              <span className="text-lg mr-1" aria-hidden="true">{type.emoji}</span>
              <b className="text-[rgb(var(--text-primary))]">{type.title}.</b> {type.text}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill>{positions.length} posities</Pill>
              <Pill>≈ {exposure.effectiveN.toFixed(1)} "echte" spreiding</Pill>
              <Pill>{Math.round(exposure.etfShare * 100)}% in ETF's</Pill>
              <Pill>{Math.round(exposure.usd * 100)}% in dollars</Pill>
            </div>
          </div>
        </div>
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
          {health.parts.map((p) => (
            <div key={p.id} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-sunken))] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-[rgb(var(--text-primary))]">{p.label}</span>
                <Pill tone={p.tone}>
                  {p.score}/{p.max}
                </Pill>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[rgb(var(--border))] overflow-hidden">
                <div
                  className="h-full rounded-full reveal-rect"
                  style={{ width: `${(p.score / p.max) * 100}%`, background: p.tone === 'good' ? '#1baf7a' : p.tone === 'ok' ? '#eda100' : '#d03b3b' }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed">{p.verdict}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            onAskAi('Geef me een uitgebreide, eerlijke analyse van mijn portefeuille: sterke punten, zwakke punten en waar ik op moet letten. Gebruik gewone taal.')
          }
          className="relative mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] hover:bg-[rgb(var(--series-1))]/15"
        >
          <Bot className="w-4 h-4" aria-hidden="true" /> Laat de AI een uitgebreide analyse schrijven
        </button>
      </section>

      {/* Verdeling */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <Card title="Waar staat je geld in de wereld?" subtitle="Door je ETF's heen gekeken (afgeronde verdeling van elk fonds).">
          <div className="space-y-3">
            {REGIONS.filter((r) => exposure.regions[r] > 0.001).map((r) => (
              <BarRow key={r} label={r === 'VS' ? 'Verenigde Staten' : r === 'Opkomend' ? 'Opkomende landen' : r} value={exposure.regions[r]} color={REGION_COLORS[r]} />
            ))}
          </div>
        </Card>
        <Card title="In welke sectoren?" subtitle="Losse aandelen plus de geschatte sectormix van je fondsen.">
          <div className="space-y-3">
            {SECTORS.map((s, i) => ({ s, v: exposure.sectors[s], c: SECTOR_COLORS[i] }))
              .filter((x) => x.v > 0.001)
              .sort((a, b) => b.v - a.v)
              .map((x) => (
                <BarRow key={x.s} label={x.s} value={x.v} color={x.c} />
              ))}
          </div>
          {exposure.unknown.length > 0 && (
            <p className="mt-3 text-[11px] text-[rgb(var(--text-muted))]">
              Nog geen profiel voor: {exposure.unknown.map(shortName).join(', ')} (telt nu als "Overig").
            </p>
          )}
        </Card>
      </div>

      <Duels
        positions={positions}
        transactions={transactions}
        histories={histories}
        benchmarks={benchmarks}
        isDemo={isDemo}
        onSelectStock={onSelectStock}
      />

      <Ideas exposure={exposure} positions={positions} isDemo={isDemo} onAskAi={onAskAi} />

      <p className="text-xs text-[rgb(var(--text-muted))] px-1">
        Dit is een hulpmiddel om zelf na te denken, geen beleggingsadvies. De verdeling van fondsen is afgerond, de ideeën komen uit een vaste lijst
        en de kerncijfers komen live van Finnhub. Doe altijd je eigen onderzoek.
      </p>
    </>
  );
};

/* ---------------- Second best: duels ---------------- */

const Duels: React.FC<{
  positions: StockPosition[];
  transactions: Transaction[];
  histories: Record<string, Points>;
  benchmarks: Record<string, Points>;
  isDemo: boolean;
  onSelectStock: (t: string) => void;
}> = ({ positions, transactions, histories, benchmarks, isDemo, onSelectStock }) => {
  const pairs = useMemo(
    () =>
      positions
        .filter((p) => p.invested > 0)
        .map((p) => ({ position: p, peer: findPeer(p.stock) })),
    [positions]
  );
  const { peers, status } = usePeerHistories(
    pairs.map((x) => x.peer?.symbol ?? '').filter(Boolean),
    isDemo
  );

  const duels = pairs.map(({ position, peer }) => {
    const txs = transactions.filter((t) => t.ticker === position.stock.ticker);
    const opponentPoints = peer ? peers[peer.symbol] : benchmarks.world;
    const result = opponentPoints ? peerDuel(txs, position.stock.currentPrice, opponentPoints) : null;
    const first = [...txs].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    let chart: { mine: number[]; theirs: number[] } | null = null;
    const own = histories[position.stock.ticker];
    if (first && opponentPoints && own) {
      const a = sampleValues(own, first, 48);
      const b = sampleValues(opponentPoints, first, 48);
      const a0 = priceOnOrFirst(own, first) ?? a[0];
      const b0 = priceOnOrFirst(opponentPoints, first) ?? b[0];
      if (a.length > 2 && b.length > 2 && a0 && b0) chart = { mine: a.map((v) => (v / a0) * 100), theirs: b.map((v) => (v / b0) * 100) };
    }
    return { position, peer, result, chart, loading: !opponentPoints && status !== 'done' };
  });

  const decided = duels.filter((d) => d.result);
  const wins = decided.filter((d) => d.result!.mine - d.result!.theirs > 0.02).length;
  const losses = decided.filter((d) => d.result!.theirs - d.result!.mine > 0.02).length;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl p-5 sm:p-6 text-white bg-gradient-to-br from-[#1f2937] via-[#2a3a5c] to-[#2a78d6] relative overflow-hidden">
        <div className="absolute -right-6 -bottom-10 text-[140px] leading-none opacity-10 select-none" aria-hidden="true">
          ⚔️
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70 flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5" aria-hidden="true" /> Second best
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-1">Jij tegen je concurrent</h2>
            <p className="text-sm text-white/80 mt-1 max-w-xl">
              Wat als je op precies dezelfde dagen, met precies dezelfde bedragen, de grootste concurrent had gekocht? Win je het duel, dan was jouw keuze beter.
            </p>
          </div>
          {decided.length > 0 && (
            <div className="text-center bg-white/10 rounded-xl px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2 justify-center">
                <Trophy className="w-5 h-5 text-amber-300" aria-hidden="true" />
                <span className="text-3xl font-extrabold tabular">
                  {wins}
                  <span className="text-white/50 text-xl"> – {losses}</span>
                </span>
              </div>
              <p className="text-[11px] text-white/70 mt-0.5">gewonnen – verloren</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {duels.map(({ position, peer, result, chart, loading }) => {
          const diff = result ? result.mine - result.theirs : 0;
          const verdict = !result ? null : diff > 0.02 ? 'win' : diff < -0.02 ? 'loss' : 'draw';
          const opponent = peer?.name ?? 'Wereldindex (MSCI World)';
          return (
            <div
              key={position.stock.ticker}
              className={`rounded-2xl border bg-[rgb(var(--surface))] p-4 ${
                verdict === 'win' ? 'border-emerald-500/40' : verdict === 'loss' ? 'border-red-500/30' : 'border-[rgb(var(--border))]'
              }`}
            >
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                <button type="button" onClick={() => onSelectStock(position.stock.ticker)} className="text-left min-w-0">
                  <p className="text-[11px] font-semibold text-[rgb(var(--text-muted))]">Jouw keuze</p>
                  <p className="text-sm font-bold text-[rgb(var(--text-primary))] truncate hover:underline">{shortName(position.stock.name)}</p>
                  {result && (
                    <p className={`text-xl font-extrabold tabular ${result.mine >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
                      {formatPercent(result.mine)}
                    </p>
                  )}
                </button>
                <span className="mt-4 text-[10px] font-black text-[rgb(var(--text-muted))] bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] rounded-full w-8 h-8 flex items-center justify-center">
                  VS
                </span>
                <div className="text-right min-w-0">
                  <p className="text-[11px] font-semibold text-[rgb(var(--text-muted))]">{peer ? 'Concurrent' : 'Geen directe rivaal'}</p>
                  <p className="text-sm font-bold text-[rgb(var(--text-primary))] truncate">{opponent}</p>
                  {result && (
                    <p className={`text-xl font-extrabold tabular ${result.theirs >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
                      {formatPercent(result.theirs)}
                    </p>
                  )}
                </div>
              </div>
              {chart && (
                <div className="mt-3">
                  <Sparkline lines={[{ values: chart.theirs, color: '#a8a79e', width: 1.5, dashed: true }, { values: chart.mine, color: '#2a78d6', width: 2.2 }]} baseline={100} height={52} />
                  <p className="text-[10px] text-[rgb(var(--text-muted))] mt-0.5">Koers sinds je eerste aankoop · blauw = jij, grijs = {peer ? peer.name : 'de index'}</p>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                {verdict === 'win' && <Pill tone="good">🏆 Goede keuze · +{Math.round(diff * 100)} procentpunt</Pill>}
                {verdict === 'loss' && <Pill tone="bad">Concurrent wint · {Math.round(diff * 100)} procentpunt</Pill>}
                {verdict === 'draw' && <Pill>🤝 Gelijkspel</Pill>}
                {!result && <Pill>{loading ? 'Koersen laden…' : 'Geen koershistorie van de concurrent'}</Pill>}
              </div>
              <p className="mt-2 text-xs text-[rgb(var(--text-muted))] leading-relaxed">
                {peer ? peer.why : 'Geen logische concurrent in de lijst, dus je strijdt tegen de wereldmarkt.'}
              </p>
            </div>
          );
        })}
      </div>
      {duels.length === 0 && <p className="text-sm text-[rgb(var(--text-muted))]">Nog geen posities om te vergelijken.</p>}
    </section>
  );
};

/* ---------------- Ideeën om te onderzoeken ---------------- */

const fmtNum = (v: number | null | undefined, digits = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('nl-NL', { maximumFractionDigits: digits }));
const fmtPct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '–' : `${(v * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`);
const fmtCap = (v: number | null | undefined) =>
  v == null ? '–' : v >= 1e12 ? `€${(v / 1e12).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} bln` : `€${Math.round(v / 1e9).toLocaleString('nl-NL')} mld`;

const Ideas: React.FC<{
  exposure: ReturnType<typeof computeExposure>;
  positions: StockPosition[];
  isDemo: boolean;
  onAskAi: (q: string) => void;
}> = ({ exposure, positions, isDemo, onAskAi }) => {
  const [round, setRound] = useState(0);
  const ideas = useMemo(() => {
    const first = rankIdeas(exposure, positions, round * 3, 3);
    return first.length ? first : rankIdeas(exposure, positions, 0, 3);
  }, [exposure, positions, round]);
  const funds = useSymbolFundamentals(
    ideas.map((i) => i.candidate.symbol ?? '').filter(Boolean),
    !isDemo
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" aria-hidden="true" /> 3 ideeën om te onderzoeken
          </h2>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-1 max-w-2xl">
            Gekozen op wat er in jouw portefeuille ontbreekt en wat past bij hoe je belegt: lange termijn, tech en AI, liefst al winstgevend. Geen koopadvies,
            wel een goed startpunt voor je eigen onderzoek.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRound((r) => r + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--surface-sunken))]"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Andere 3
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {ideas.map((idea, i) => (
          <IdeaCard key={idea.candidate.id} idea={idea} rank={round * 3 + i + 1} fund={idea.candidate.symbol ? funds[idea.candidate.symbol] : undefined} isDemo={isDemo} onAskAi={onAskAi} />
        ))}
      </div>
    </section>
  );
};

const IdeaCard: React.FC<{ idea: Idea; rank: number; fund?: Fundamentals; isDemo: boolean; onAskAi: (q: string) => void }> = ({ idea, rank, fund, isDemo, onAskAi }) => {
  const [open, setOpen] = useState(rank % 3 === 1);
  const c = idea.candidate;
  const gradient = ['from-[#2a78d6] to-[#8b5cf6]', 'from-[#1baf7a] to-[#2a78d6]', 'from-[#eb6834] to-[#e87ba4]'][(rank - 1) % 3];
  return (
    <article className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] overflow-hidden flex flex-col">
      <div className={`bg-gradient-to-br ${gradient} p-4 text-white`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold bg-white/20 rounded-full px-2 py-0.5">#{rank}</span>
          <span className="text-[11px] font-semibold bg-black/15 rounded-full px-2 py-0.5">
            {c.kind} · {c.region === 'VS' ? 'Amerika' : c.region}
          </span>
        </div>
        <h3 className="text-xl font-extrabold text-white mt-3">{c.name}</h3>
        <p className="text-xs text-white/85 mt-1">{c.sector === 'Overig' ? 'Breed gespreid' : c.sector}</p>
      </div>
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <p className="text-sm">{c.what}</p>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--text-muted))] flex items-center gap-1">
            <Sparkles className="w-3 h-3" aria-hidden="true" /> Waarom voor jou
          </p>
          <ul className="mt-1.5 space-y-1">
            {idea.reasons.map((r) => (
              <li key={r} className="text-xs flex gap-1.5">
                <span className="text-[rgb(var(--status-good))]" aria-hidden="true">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        {idea.shift.length > 0 && (
          <div className="rounded-lg bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] p-2.5">
            <p className="text-[11px] font-semibold text-[rgb(var(--text-muted))]">Als dit 5% van je portefeuille wordt:</p>
            {idea.shift.map((s) => (
              <p key={s.label} className="text-xs mt-1 tabular">
                {s.label}: <b className="text-[rgb(var(--text-primary))]">{Math.round(s.from * 100)}%</b> → <b className="text-[rgb(var(--status-good))]">{Math.round(s.to * 100)}%</b>
              </p>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center justify-between text-xs font-semibold text-[rgb(var(--accent-text))] pt-1"
        >
          {open ? 'Minder tonen' : 'Diepgang: AI-kant, risico\'s, cijfers'}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {open && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--text-muted))]">Het verhaal</p>
              <p className="text-xs mt-1 leading-relaxed">{c.angle}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--text-muted))] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Risico's
              </p>
              <ul className="mt-1 space-y-0.5">
                {c.risks.map((r) => (
                  <li key={r} className="text-xs flex gap-1.5">
                    <span className="text-[rgb(var(--status-critical))]" aria-hidden="true">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            {c.symbol && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--text-muted))]">Kerncijfers (live)</p>
                {isDemo ? (
                  <p className="text-xs text-[rgb(var(--text-muted))] mt-1">Live cijfers zie je alleen in je echte account.</p>
                ) : !fund ? (
                  <p className="text-xs text-[rgb(var(--text-muted))] mt-1">Laden…</p>
                ) : !fund.available ? (
                  <p className="text-xs text-[rgb(var(--text-muted))] mt-1">Nu niet beschikbaar.</p>
                ) : (
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular">
                    <dt className="text-[rgb(var(--text-muted))]">Koers/winst</dt>
                    <dd className="text-right font-semibold text-[rgb(var(--text-primary))]">{fmtNum(fund.pe)}</dd>
                    <dt className="text-[rgb(var(--text-muted))]">Omzetgroei (jaar)</dt>
                    <dd className="text-right font-semibold text-[rgb(var(--text-primary))]">{fmtPct(fund.revenueGrowth)}</dd>
                    <dt className="text-[rgb(var(--text-muted))]">Nettomarge</dt>
                    <dd className={`text-right font-semibold ${fund.netMargin != null && fund.netMargin < 0 ? 'text-[rgb(var(--status-critical))]' : 'text-[rgb(var(--text-primary))]'}`}>
                      {fmtPct(fund.netMargin)}
                    </dd>
                    <dt className="text-[rgb(var(--text-muted))]">Beurswaarde</dt>
                    <dd className="text-right font-semibold text-[rgb(var(--text-primary))]">{fmtCap(fund.marketCapEur)}</dd>
                    <dt className="text-[rgb(var(--text-muted))]">Beta (schommeling)</dt>
                    <dd className="text-right font-semibold text-[rgb(var(--text-primary))]">{fmtNum(fund.beta, 2)}</dd>
                  </dl>
                )}
              </div>
            )}
            <p className="text-xs flex gap-1.5 text-[rgb(var(--text-muted))]">
              <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> {c.where}
            </p>
          </div>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onAskAi(`Leg ${c.name} uitgebreid uit: wat doet het bedrijf, hoe verdient het geld, wat zijn de risico's, en hoe zou het passen in mijn portefeuille? Geen koopadvies, wel eerlijk.`)}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--border))] px-3 py-2 text-xs font-semibold hover:bg-[rgb(var(--surface-sunken))]"
        >
          <Bot className="w-3.5 h-3.5" aria-hidden="true" /> Vraag de AI over {c.name}
        </button>
      </div>
    </article>
  );
};
