import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileText, Info, Minus } from 'lucide-react';
import { Card } from './Card.tsx';
import { Private } from '../hooks/usePrivacy.tsx';
import { useWeeklyReports } from '../hooks/useWeeklyReports.ts';
import { ReportPosition, WeeklyReport } from '../data/types.ts';
import { formatEuro, formatPercent, formatPercentPlain } from '../utils/portfolio.ts';
import { shortName } from '../utils/names.ts';

interface Props {
  isDemo: boolean;
  onSelectStock: (ticker: string) => void;
}

const tone = (v: number | null) =>
  v === null || v === 0
    ? 'text-[rgb(var(--text-secondary))]'
    : v > 0
      ? 'text-[rgb(var(--status-good))]'
      : 'text-[rgb(var(--status-critical))]';

/** Pijl + teken i.p.v. kleur alleen (WCAG). */
const Trend: React.FC<{ value: number | null; className?: string }> = ({ value, className = '' }) => {
  if (value === null) return <span className={`text-[rgb(var(--text-muted))] ${className}`}>onbekend</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 tabular font-semibold ${tone(value)} ${className}`}>
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {formatPercent(value)}
    </span>
  );
};

const longDate = (iso: string) =>
  new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(new Date(iso + 'T00:00:00'));
const weekLabel = (r: WeeklyReport) => `${longDate(r.weekStart)} t/m ${longDate(r.weekEnd)}`;

const TextBlock: React.FC<{ title: string; text: string }> = ({ title, text }) =>
  text ? (
    <div>
      <h3 className="text-sm font-bold text-[rgb(var(--text-primary))]">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--text-secondary))]">{text}</p>
    </div>
  ) : null;

export const WeeklyReportPage: React.FC<Props> = ({ isDemo, onSelectStock }) => {
  const { reports, loading, error } = useWeeklyReports(isDemo);
  const [selected, setSelected] = useState<string | null>(null);

  // Standaard het nieuwste rapport; blijft staan als er een nieuw rapport bijkomt tijdens het kijken.
  useEffect(() => {
    if (reports.length > 0 && !reports.some((r) => r.weekStart === selected)) setSelected(reports[0].weekStart);
  }, [reports, selected]);

  const report = useMemo(() => reports.find((r) => r.weekStart === selected) ?? reports[0], [reports, selected]);

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] flex items-center justify-center shrink-0" aria-hidden="true">
          <FileText className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[rgb(var(--text-primary))]">Weekrapport</h1>
          <p className="text-sm text-[rgb(var(--text-muted))]">
            Elke zondagavond schrijft een AI in n8n een korte terugblik op je portefeuille. De cijfers worden apart uitgerekend, de AI legt ze uit.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-[rgb(var(--text-muted))]">Laden…</p>
      ) : error ? (
        <Card>
          <p className="text-sm text-[rgb(var(--status-critical))]">{error}</p>
        </Card>
      ) : !report ? (
        <Card title="Nog geen rapport">
          <p className="text-sm text-[rgb(var(--text-secondary))]">
            Het eerste rapport verschijnt zodra de n8n-workflow "Weekrapport met AI" draait. Wil je niet tot zondag wachten? Open de workflow in n8n
            en klik op "Execute workflow".
          </p>
        </Card>
      ) : (
        <>
          {reports.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="report-week" className="text-[rgb(var(--text-muted))]">
                Week
              </label>
              <select
                id="report-week"
                value={report.weekStart}
                onChange={(e) => setSelected(e.target.value)}
                className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text-primary))] px-3 py-2 min-h-[44px]"
              >
                {reports.map((r) => (
                  <option key={r.weekStart} value={r.weekStart}>
                    {weekLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <ReportView report={report} isDemo={isDemo} onSelectStock={onSelectStock} />
        </>
      )}
    </div>
  );
};

const ReportView: React.FC<{ report: WeeklyReport; isDemo: boolean; onSelectStock: (ticker: string) => void }> = ({
  report,
  isDemo,
  onSelectStock,
}) => {
  const { stats, content } = report;
  const byTicker = useMemo(() => new Map(stats.positions.map((p) => [p.ticker, p])), [stats.positions]);
  const created = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(report.createdAt));

  return (
    <>
      <Card>
        <p className="text-xs text-[rgb(var(--text-muted))]">Week van {weekLabel(report)}</p>
        <h2 className="mt-1 text-lg sm:text-xl font-bold text-[rgb(var(--text-primary))]">{content.headline}</h2>

        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <dt className="text-xs text-[rgb(var(--text-muted))]">Deze week</dt>
            <dd className="text-2xl font-bold">
              <Trend value={stats.weekChangePct} />
            </dd>
            {stats.weekChangeAmount !== null && (
              <dd className={`text-xs tabular ${tone(stats.weekChangeAmount)}`}>
                <Private>{formatEuro(stats.weekChangeAmount)}</Private>
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-[rgb(var(--text-muted))]">Waarde</dt>
            <dd className="text-2xl font-bold tabular text-[rgb(var(--text-primary))]">
              <Private>{formatEuro(stats.totalValue)}</Private>
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-[rgb(var(--text-muted))]">Sinds aankoop</dt>
            <dd className="text-2xl font-bold">
              <Trend value={stats.returnPct} />
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-sm leading-relaxed text-[rgb(var(--text-secondary))]">{content.summary}</p>
      </Card>

      {content.movers.length > 0 && (
        <Card title="Bewegers" subtitle="Wat er deze week opviel">
          <ul className="-mx-2 sm:-mx-3 divide-y divide-[rgb(var(--border))]">
            {content.movers.map((m) => {
              const p: ReportPosition | undefined = byTicker.get(m.ticker);
              return (
                <li key={m.ticker}>
                  <button
                    type="button"
                    onClick={() => onSelectStock(m.ticker)}
                    className="w-full flex items-start gap-3 px-2 sm:px-3 py-3 text-left rounded-xl hover:bg-[rgb(var(--surface-sunken))] transition-colors"
                  >
                    <span className="w-24 shrink-0">
                      <span className="block text-sm font-semibold text-[rgb(var(--text-primary))] truncate" title={p?.name}>
                        {p ? shortName(p.name) : m.ticker}
                      </span>
                      <Trend value={p ? p.weekChangePct : null} className="text-xs" />
                    </span>
                    <span className="text-sm text-[rgb(var(--text-secondary))]">{m.comment}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Card title="Spreiding en verhouding">
          <div className="space-y-4">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[rgb(var(--text-muted))]">ETF's</dt>
                <dd className="font-bold tabular text-[rgb(var(--text-primary))]">{formatPercentPlain(stats.etfShare, 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[rgb(var(--text-muted))]">Top 3</dt>
                <dd className="font-bold tabular text-[rgb(var(--text-primary))]">{formatPercentPlain(stats.top3Share, 0)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[rgb(var(--text-muted))]">Niet in euro</dt>
                <dd className="font-bold tabular text-[rgb(var(--text-primary))]">
                  {formatPercentPlain(stats.currency.filter((c) => c.currency !== 'EUR').reduce((s, c) => s + c.share, 0), 0)}
                </dd>
              </div>
            </dl>
            <TextBlock title="Spreiding" text={content.concentration} />
            <TextBlock title="ETF's en losse aandelen" text={content.split} />
          </div>
        </Card>

        <Card title="Per positie" subtitle="Verandering over de week">
          <ul className="divide-y divide-[rgb(var(--border))] text-sm">
            {stats.positions.map((p) => (
              <li key={p.ticker} className="flex items-center justify-between gap-3 py-2">
                <button type="button" onClick={() => onSelectStock(p.ticker)} className="min-w-0 text-left hover:underline">
                  <span className="block font-semibold text-[rgb(var(--text-primary))] truncate">{shortName(p.name)}</span>
                  <span className="block text-xs text-[rgb(var(--text-muted))] tabular">
                    {p.ticker} · {formatPercentPlain(p.allocation, p.allocation < 0.1 ? 1 : 0)}
                    {p.newThisWeek ? ' · nieuw deze week' : ''}
                  </span>
                </button>
                <Trend value={p.weekChangePct} className="shrink-0" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {(content.upcoming || content.dataNote) && (
        <Card title="Wat komt eraan">
          <div className="space-y-4">
            <TextBlock title="Uitkeringen" text={content.upcoming} />
            {content.dataNote && (
              <p className="flex items-start gap-2 text-xs text-[rgb(var(--text-muted))]">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                {content.dataNote}
              </p>
            )}
          </div>
        </Card>
      )}

      <p className="text-xs text-[rgb(var(--text-muted))]">
        {isDemo ? 'Voorbeeldrapport met verzonnen cijfers. ' : `Gemaakt op ${created}${report.model ? ` door ${report.model}` : ''}. `}
        Geschreven door AI op basis van je eigen cijfers: kan fouten bevatten en is geen beleggingsadvies.
      </p>
    </>
  );
};
