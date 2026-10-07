import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, GraduationCap, Info, Save } from 'lucide-react';
import { Card } from './Card.tsx';
import { StudyLoanChart, ymLabel } from './StudyLoanChart.tsx';
import { Private, usePrivacy } from '../hooks/usePrivacy.tsx';
import { useLoanSettings } from '../hooks/useLoanSettings.ts';
import { PortfolioTotals, formatEuro, formatEuroPrecise, formatPercent } from '../utils/portfolio.ts';
import {
  DRAAGKRACHT_VRIJSTELLING,
  KNOWN_RATES,
  LoanProjection,
  LoanSettings,
  MAX_LENING_PER_MAAND,
  Phase,
  balanceAt,
  projectLoan,
  rateForYear,
  ymAdd,
  ymDiff,
  ymParse,
} from '../utils/studyLoan.ts';

interface Props {
  isDemo: boolean;
  totals: PortfolioTotals;
  /** Is de kostprijs van alle posities bekend (anders geen winst tonen)? */
  showInvested: boolean;
}

const pct = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const PHASE_LABEL: Record<Phase, string> = {
  studie: 'Studeren',
  aanloop: 'Na studie',
  aflossen: 'Terugbetalen',
  klaar: 'Klaar',
};
const PHASE_DOT: Record<Phase, string> = {
  studie: '--series-1',
  aanloop: '--series-4',
  aflossen: '--series-3',
  klaar: '--series-3',
};

const ageIn = (s: LoanSettings, ym: string) => s.ageNow + (ymParse(ym).y - ymParse(s.asOf).y);

export const StudyLoanPage: React.FC<Props> = ({ isDemo, totals, showInvested }) => {
  const { settings, update, save, applyCode, saveState, hasSaved, savedAt, loadError } = useLoanSettings(isDemo, totals.totalValue);

  if (!settings) {
    return <p className="text-sm text-[rgb(var(--text-muted))]">Laden…</p>;
  }

  // Eerste keer: alleen het invulscherm, tot je opslaat (anders springt de pagina om tijdens het typen).
  const empty = !hasSaved;

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="mt-1 w-9 h-9 shrink-0 rounded-xl bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] flex items-center justify-center" aria-hidden="true">
          <GraduationCap className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[rgb(var(--text-primary))]">Studieschuld</h1>
          <p className="text-sm text-[rgb(var(--text-muted))] mt-0.5">
            Je DUO-lening vooruitgerekend: hoeveel je straks schuldig bent, wat de rente kost en hoe lang terugbetalen duurt.
          </p>
        </div>
      </header>

      {loadError && (
        <p className="text-xs text-[rgb(var(--status-critical))]">Je opgeslagen gegevens konden niet worden geladen. Probeer de pagina opnieuw te laden.</p>
      )}

      {empty && <QuickFill onApply={applyCode} />}

      {empty ? (
        <SettingsCard
          settings={settings}
          update={update}
          save={save}
          saveState={saveState}
          isDemo={isDemo}
          savedAt={savedAt}
          siteValue={totals.totalValue}
          intro
        />
      ) : (
        <>
          <LoanOverview settings={settings} update={update} totals={totals} showInvested={showInvested} />
          <SettingsCard
            settings={settings}
            update={update}
            save={save}
            saveState={saveState}
            isDemo={isDemo}
            savedAt={hasSaved ? savedAt : null}
            siteValue={totals.totalValue}
          />
          <HowItWorks />
        </>
      )}
    </div>
  );
};

// ---------- overzicht ----------

const LoanOverview: React.FC<{
  settings: LoanSettings;
  update: (p: Partial<LoanSettings>) => void;
  totals: PortfolioTotals;
  showInvested: boolean;
}> = ({ settings: s, update, totals, showInvested }) => {
  const base = useMemo(() => projectLoan({ ...s, extraPerMonth: 0 }), [s]);
  const withExtra = useMemo(() => (s.extraPerMonth > 0 ? projectLoan(s) : null), [s]);
  const main = withExtra ?? base;
  const markYm = ymAdd(s.asOf, 30 * 12);
  const in30 = balanceAt(main, markYm);
  const rateNow = rateForYear(ymParse(s.asOf).y, s.rateLater);
  const interestPerMonthNow = (s.debtNow * rateNow) / 12;

  return (
    <>
      {/* Kerncijfers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Schuld nu" value={<Private>{formatEuro(s.debtNow)}</Private>}>
          ± <Private>{formatEuroPrecise(interestPerMonthNow)}</Private> rente erbij per maand
        </Tile>
        <Tile label="Als je stopt met lenen" value={<Private>{formatEuro(main.debtAtStop)}</Private>}>
          {ymLabel(main.stopYm)}
        </Tile>
        <Tile label="Terugbetalen" value={<><Private>{formatEuro(main.firstPayment)}</Private><span className="text-sm font-semibold"> /mnd</span></>}>
          vanaf {ymLabel(main.aflosStartYm)}
        </Tile>
        <Tile label="Over 30 jaar" value={<Private>{formatEuro(in30)}</Private>}>
          {in30 > 0 ? `${ymParse(markYm).y}, je bent dan ${ageIn(s, markYm)}` : 'Dan ben je al klaar'}
        </Tile>
      </div>

      {/* Grafiek */}
      <Card title="Je schuld door de tijd" subtitle="Van nu tot je klaar bent met terugbetalen. Probeer de knoppen: de grafiek past zich meteen aan.">
        <div className="space-y-3 mb-5">
          <ChipRow
            label="Hoe lang leen je nog?"
            value={s.lastLoanMonth}
            onChange={(v) => update({ lastLoanMonth: v })}
            options={[
              { value: s.asOf, label: 'Nu stoppen' },
              { value: s.bachelorEnd, label: `Alleen bachelor · t/m ${ymLabel(s.bachelorEnd)}` },
              { value: ymAdd(s.bachelorEnd, 12), label: `+ master 1 jaar · t/m ${ymLabel(ymAdd(s.bachelorEnd, 12))}` },
              { value: ymAdd(s.bachelorEnd, 24), label: `+ master 2 jaar · t/m ${ymLabel(ymAdd(s.bachelorEnd, 24))}` },
            ]}
          />
          <ChipRow
            label="Extra aflossen per maand"
            value={String(s.extraPerMonth)}
            onChange={(v) => update({ extraPerMonth: Number(v) })}
            options={[0, 100, 250, 500].map((n) => ({ value: String(n), label: n === 0 ? 'Niets extra' : `+ ${formatEuro(n)}` }))}
          />
        </div>

        <StudyLoanChart base={base} extra={withExtra} extraPerMonth={s.extraPerMonth} ageNow={s.ageNow} markYm={markYm} />

        <Outcome s={s} base={base} extra={withExtra} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <InterestCard s={s} p={main} interestPerMonthNow={interestPerMonthNow} />
        <CompareCard s={s} totals={totals} showInvested={showInvested} rateNow={rateNow} />
      </div>

      <YearTable s={s} p={main} markYm={markYm} />
    </>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode; children?: React.ReactNode }> = ({ label, value, children }) => (
  <div className="rounded-2xl bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] min-w-0">
    <p className="text-xs font-medium text-[rgb(var(--text-muted))]">{label}</p>
    <p className="mt-1 text-xl sm:text-2xl font-bold tabular text-[rgb(var(--text-primary))]">{value}</p>
    {children && <p className="mt-0.5 text-xs text-[rgb(var(--text-muted))] tabular">{children}</p>}
  </div>
);

function ChipRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const known = options.some((o) => o.value === value);
  return (
    <div className="no-print">
      <p className="text-xs font-medium text-[rgb(var(--text-muted))] mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value + o.label}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              value === o.value
                ? 'bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))] border-transparent'
                : 'border-[rgb(var(--border))] text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))]'
            }`}
          >
            {o.label}
          </button>
        ))}
        {!known && (
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[rgb(var(--series-1))]/10 text-[rgb(var(--accent-text))]">Eigen keuze</span>
        )}
      </div>
    </div>
  );
}

/** Eén of twee zinnen onder de grafiek: wanneer ben je klaar, en wat scheelt extra aflossen. */
const Outcome: React.FC<{ s: LoanSettings; base: LoanProjection; extra: LoanProjection | null }> = ({ s, base, extra }) => {
  const end = (p: LoanProjection) =>
    p.paidOffYm ? `${ymLabel(p.paidOffYm)} (je bent dan ${ageIn(s, p.paidOffYm)})` : `${ymLabel(p.aflosEndYm)}, daarna wordt de rest kwijtgescholden`;
  return (
    <div className="mt-4 rounded-xl bg-[rgb(var(--surface-sunken))] border border-[rgb(var(--border))] p-3.5 text-sm text-[rgb(var(--text-secondary))] space-y-1">
      <p>
        Met het DUO-maandbedrag ben je klaar in <span className="font-semibold text-[rgb(var(--text-primary))]">{end(base)}</span>.
      </p>
      {extra && (
        <p>
          Met <Private>{formatEuro(s.extraPerMonth)}</Private> extra per maand:{' '}
          <span className="font-semibold text-[rgb(var(--series-3))]">{end(extra)}</span>. Dat scheelt{' '}
          <span className="font-semibold text-[rgb(var(--text-primary))]">
            <Private>{formatEuro(base.totalInterest - extra.totalInterest)}</Private>
          </span>{' '}
          aan rente.
        </p>
      )}
      {base.draagkrachtMonthly !== null && (
        <p className="text-xs">
          Met een salaris van <Private>{formatEuro(s.salary)}</Private> per jaar betaal je volgens de draagkrachtregel hooguit{' '}
          <Private>{formatEuroPrecise(base.draagkrachtMonthly)}</Private> per maand
          {base.forgiven > 0 && (
            <>
              ; na 35 jaar wordt dan <Private>{formatEuro(base.forgiven)}</Private> kwijtgescholden
            </>
          )}
          . In werkelijkheid groeit je salaris meestal, dus zie dit als ondergrens.
        </p>
      )}
    </div>
  );
};

// ---------- rente ----------

const InterestCard: React.FC<{ s: LoanSettings; p: LoanProjection; interestPerMonthNow: number }> = ({ s, p, interestPerMonthNow }) => {
  const principal = s.debtNow + p.totalBorrowedFromNow;
  const perEuro = principal > 0 ? p.totalPaid / principal : 0;
  const interestAtStop = (p.debtAtStop * p.aanloopRate) / 12;
  const knownYears = Object.keys(KNOWN_RATES)
    .map(Number)
    .filter((y) => y >= ymParse(s.asOf).y)
    .sort();

  return (
    <Card title="Wat kost de rente je?" subtitle="Rente wordt elke maand bij je schuld opgeteld, ook over rente die er al bij kwam">
      <div className="flex flex-wrap gap-2 mb-4">
        {knownYears.map((y) => (
          <span key={y} className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-xs">
            <span className="text-[rgb(var(--text-muted))]">{y} </span>
            <span className="font-semibold text-[rgb(var(--text-primary))] tabular">{pct(KNOWN_RATES[y])}</span>
          </span>
        ))}
        <span className="rounded-lg border border-dashed border-[rgb(var(--border-strong))] px-2.5 py-1.5 text-xs">
          <span className="text-[rgb(var(--text-muted))]">daarna (aanname) </span>
          <span className="font-semibold text-[rgb(var(--text-primary))] tabular">{pct(s.rateLater)}</span>
        </span>
      </div>

      <dl className="divide-y divide-[rgb(var(--border))]">
        <Row label="Rente erbij per maand, nu">
          <Private>{formatEuroPrecise(interestPerMonthNow)}</Private>
        </Row>
        <Row label={`Rente erbij per maand, na ${ymLabel(p.stopYm)}`}>
          <Private>{formatEuroPrecise(interestAtStop)}</Private>
        </Row>
        <Row label="Je leent er nog bij">
          <Private>{formatEuro(p.totalBorrowedFromNow)}</Private>
        </Row>
        {s.monthlyGrant > 0 && (
          <Row label="Basisbeurs tot je stopt (gift met diploma)">
            <Private>{formatEuro(s.monthlyGrant * Math.max(0, ymDiff(s.asOf, p.stopYm)))}</Private>
          </Row>
        )}
        <Row label="Rente van nu tot het einde" strong>
          <Private>{formatEuro(p.totalInterest)}</Private>
        </Row>
        <Row label="In totaal betaal je terug">
          <Private>{formatEuro(p.totalPaid)}</Private>
        </Row>
      </dl>

      {perEuro > 0 && (
        <p className="mt-4 text-sm text-[rgb(var(--text-secondary))]">
          Gevoel erbij: voor elke euro schuld betaal je uiteindelijk ongeveer{' '}
          <span className="font-semibold text-[rgb(var(--text-primary))] tabular">{formatEuroPrecise(perEuro)}</span> terug.
        </p>
      )}
      <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
        Vanaf {ymLabel(p.aanloopStartYm)} staat je rente 5 jaar vast op {pct(p.aanloopRate)}
        {KNOWN_RATES[ymParse(p.aanloopStartYm).y] === undefined ? ' (aanname, DUO maakt dit elk najaar bekend)' : ''}. Daarna steeds een nieuwe periode van 5 jaar.
      </p>
    </Card>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode; strong?: boolean; sub?: React.ReactNode }> = ({ label, children, strong, sub }) => (
  <div className="flex items-baseline justify-between gap-3 py-2.5">
    <dt className="text-sm text-[rgb(var(--text-secondary))]">
      {label}
      {sub && <span className="block text-xs text-[rgb(var(--text-muted))] tabular mt-0.5">{sub}</span>}
    </dt>
    <dd className={`tabular text-right ${strong ? 'text-base font-bold text-[rgb(var(--text-primary))]' : 'text-sm font-semibold text-[rgb(var(--text-primary))]'}`}>
      {children}
    </dd>
  </div>
);

// ---------- geleend tegenover DEGIRO ----------

const CompareCard: React.FC<{ s: LoanSettings; totals: PortfolioTotals; showInvested: boolean; rateNow: number }> = ({
  s,
  totals,
  showInvested,
  rateNow,
}) => {
  const bezit = s.degiroTotal;
  const schuld = s.debtNow;
  const netto = bezit - schuld;
  const winst = showInvested ? totals.totalProfitLoss : null;
  const eigen = winst !== null ? netto - winst : null;
  const parts =
    eigen !== null && winst !== null && winst >= 0 && eigen >= 0 && bezit > 0
      ? [
          { label: 'Geleend bij DUO', value: Math.min(schuld, bezit), color: '--series-2' },
          { label: 'Eigen geld', value: eigen, color: '--series-1' },
          { label: 'Winst', value: winst, color: '--status-good-bg' },
        ]
      : null;
  const renteDitJaar = schuld * rateNow;

  return (
    <Card title="Geleend tegenover je DEGIRO" subtitle="Wat is van jou als je je schuld vandaag in één keer zou aflossen?">
      <dl className="divide-y divide-[rgb(var(--border))]">
        <Row
          label="Op je DEGIRO"
          sub={
            <>
              waarvan belegd <Private>{formatEuro(bezit - s.degiroCash)}</Private> en vrije ruimte <Private>{formatEuro(s.degiroCash)}</Private>
            </>
          }
        >
          <Private>{formatEuro(bezit)}</Private>
        </Row>
        <Row label="Schuld bij DUO">
          − <Private>{formatEuro(schuld)}</Private>
        </Row>
        <div className="flex items-baseline justify-between gap-3 py-3">
          <dt className="text-sm font-semibold text-[rgb(var(--text-primary))]">Van jou</dt>
          <dd className={`text-xl font-bold tabular ${netto >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
            <Private>{formatEuro(netto)}</Private>
          </dd>
        </div>
      </dl>

      {parts && (
        <div className="mt-2">
          <div className="flex h-3 rounded-full overflow-hidden bg-[rgb(var(--surface-sunken))]" aria-hidden="true">
            {parts.map((p) => (
              <div key={p.label} style={{ width: `${(p.value / bezit) * 100}%`, backgroundColor: `rgb(var(${p.color}))` }} />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-[rgb(var(--text-secondary))]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgb(var(${p.color}))` }} aria-hidden="true" />
                  {p.label}
                </span>
                <span className="tabular font-semibold text-[rgb(var(--text-primary))]">
                  <Private>{formatEuro(p.value)}</Private>{' '}
                  <span className="text-xs font-normal text-[rgb(var(--text-muted))]">{Math.round((p.value / bezit) * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
            Ervan uitgaand dat al je DUO-geld op DEGIRO staat. Winst volgens deze site, op basis van je orders.
          </p>
        </div>
      )}
      {eigen !== null && eigen < 0 && (
        <p className="mt-2 text-xs text-[rgb(var(--text-muted))]">
          Je schuld is groter dan wat er na winst op DEGIRO staat: niet al je geleende geld zit dus in je beleggingen.
        </p>
      )}

      <p className="mt-4 text-sm text-[rgb(var(--text-secondary))]">
        De lening kost nu {pct(rateNow)} per jaar, dat is ongeveer <Private>{formatEuro(renteDitJaar)}</Private> rente over een jaar.
        {showInvested && totals.totalInvested > 0 && (
          <>
            {' '}
            Je beleggingen staan op{' '}
            <span className={`font-semibold ${totals.totalProfitLossPct >= 0 ? 'text-[rgb(var(--status-good))]' : 'text-[rgb(var(--status-critical))]'}`}>
              {formatPercent(totals.totalProfitLossPct)}
            </span>{' '}
            sinds aankoop.
          </>
        )}
      </p>
    </Card>
  );
};

// ---------- tabel per jaar ----------

const YearTable: React.FC<{ s: LoanSettings; p: LoanProjection; markYm: string }> = ({ s, p, markYm }) => {
  const [all, setAll] = useState(false);
  const markYear = ymParse(markYm).y;
  const aflosYear = ymParse(p.aflosStartYm).y;
  const lastYear = p.years[p.years.length - 1]?.year ?? 0;
  const rows = all
    ? p.years
    : p.years.filter((r) => r.year <= aflosYear + 1 || (r.year - aflosYear) % 5 === 0 || r.year === markYear || r.year === lastYear);

  return (
    <Card
      title="Per jaar"
      subtitle={all ? 'Alle jaren' : 'De eerste jaren, daarna elke 5 jaar. Het jaar over 30 jaar is gemarkeerd.'}
      action={
        <button type="button" onClick={() => setAll((a) => !a)} className="no-print text-xs font-semibold text-[rgb(var(--accent-text))] hover:underline whitespace-nowrap">
          {all ? 'Minder jaren' : 'Alle jaren tonen'}
        </button>
      }
    >
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full sm:min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--border-strong))] text-left text-[rgb(var(--text-secondary))]">
              <th className="py-2 px-4 sm:px-2 font-semibold">Jaar</th>
              <th className="hidden sm:table-cell py-2 px-2 font-semibold">Fase</th>
              <th className="hidden sm:table-cell py-2 px-2 font-semibold text-right">Geleend</th>
              <th className="py-2 px-2 font-semibold text-right">Rente</th>
              <th className="py-2 px-2 font-semibold text-right">Afgelost</th>
              <th className="py-2 px-4 sm:px-2 font-semibold text-right">Schuld eind jaar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mark = r.year === markYear;
              return (
                <tr
                  key={r.year}
                  className={`border-b border-[rgb(var(--border))] last:border-0 ${mark ? 'bg-[rgb(var(--series-1))]/[0.06]' : ''}`}
                >
                  <td className="py-2.5 px-4 sm:px-2 whitespace-nowrap">
                    <span className="sm:hidden inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: `rgb(var(${PHASE_DOT[r.phase]}))` }} aria-hidden="true" />
                    <span className="font-semibold text-[rgb(var(--text-primary))] tabular">{r.year}</span>
                    <span className="text-xs text-[rgb(var(--text-muted))]"> · {r.age} jr</span>
                    {mark && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--accent-text))]">+30 jaar</span>}
                  </td>
                  <td className="hidden sm:table-cell py-2.5 px-2 whitespace-nowrap text-[rgb(var(--text-secondary))]">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: `rgb(var(${PHASE_DOT[r.phase]}))` }} aria-hidden="true" />
                    {r.balanceEnd === 0 && r.phase === 'aflossen' ? PHASE_LABEL.klaar : PHASE_LABEL[r.phase]}
                  </td>
                  <Num v={r.borrowed} className="hidden sm:table-cell" />
                  <Num v={r.interest} />
                  <Num v={r.paid} />
                  <td className="py-2.5 px-4 sm:px-2 text-right tabular font-semibold text-[rgb(var(--text-primary))]">
                    <Private>{formatEuro(r.balanceEnd)}</Private>
                    {r.forgiven > 0 && (
                      <span className="block text-xs font-normal text-[rgb(var(--text-muted))]">
                        <Private>{formatEuro(r.forgiven)}</Private> kwijtgescholden
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[rgb(var(--text-muted))]">
        Je leeftijd is per kalenderjaar geteld vanaf {s.ageNow} in {ymParse(s.asOf).y}. Bedragen zijn afgerond.
      </p>
    </Card>
  );
};

const Num: React.FC<{ v: number; className?: string }> = ({ v, className = '' }) => (
  <td className={`${className} py-2.5 px-2 text-right tabular text-[rgb(var(--text-secondary))]`}>{v > 0.5 ? <Private>{formatEuro(v)}</Private> : '—'}</td>
);

// ---------- instellingen ----------

function parseNl(text: string): number | null {
  const t = text.replace(/[€\s%]/g, '');
  if (t === '') return 0;
  // "1.234,56" en "1234.56" allebei goed lezen
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
const fmtNl = (n: number, digits = 2) =>
  new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n);

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: React.ReactNode;
  prefix?: string;
  suffix?: string;
  /** Waarde wordt als percentage getoond (0.027 -> 2,7) */
  percent?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, hint, prefix, suffix, percent, placeholder }) => {
  const shown = percent ? value * 100 : value;
  const [text, setText] = useState(shown ? fmtNl(shown) : '');
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(shown ? fmtNl(shown) : '');
  }, [shown, focus]);
  const { hidden } = usePrivacy();
  const invalid = parseNl(text) === null;
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-[rgb(var(--text-secondary))] mb-1">{label}</span>
      <span
        className={`flex items-center rounded-xl border bg-[rgb(var(--surface))] focus-within:ring-2 focus-within:ring-[rgb(var(--series-1))]/40 ${
          invalid ? 'border-[rgb(var(--status-critical))]' : 'border-[rgb(var(--border))]'
        }`}
      >
        {prefix && <span className="pl-3 text-sm text-[rgb(var(--text-muted))]">{prefix}</span>}
        <input
          type={hidden ? 'password' : 'text'}
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNl(e.target.value);
            if (n !== null && n >= 0) onChange(percent ? n / 100 : n);
          }}
          className="w-full min-w-0 bg-transparent px-3 py-2.5 text-sm tabular text-[rgb(var(--text-primary))] focus:outline-none"
        />
        {suffix && <span className="pr-3 text-sm text-[rgb(var(--text-muted))]">{suffix}</span>}
      </span>
      {hint && <span className="block text-[11px] text-[rgb(var(--text-muted))] mt-1">{hint}</span>}
    </label>
  );
};

const MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

const MonthField: React.FC<{ label: string; value: string; onChange: (ym: string) => void; minYear: number; maxYear: number; hint?: string }> = ({
  label,
  value,
  onChange,
  minYear,
  maxYear,
  hint,
}) => {
  const { y, m } = ymParse(value);
  const years: number[] = [];
  for (let i = minYear; i <= maxYear; i++) years.push(i);
  const sel =
    'rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-2.5 text-sm text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--series-1))]/40';
  return (
    <div className="min-w-0">
      <span className="block text-xs font-medium text-[rgb(var(--text-secondary))] mb-1">{label}</span>
      <div className="flex gap-2">
        <select aria-label={`${label}: maand`} value={m} onChange={(e) => onChange(`${y}-${String(e.target.value).padStart(2, '0')}`)} className={`${sel} flex-1 min-w-0`}>
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <select aria-label={`${label}: jaar`} value={y} onChange={(e) => onChange(`${e.target.value}-${String(m).padStart(2, '0')}`)} className={sel}>
          {years.map((yy) => (
            <option key={yy} value={yy}>
              {yy}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="block text-[11px] text-[rgb(var(--text-muted))] mt-1">{hint}</span>}
    </div>
  );
};

const SettingsCard: React.FC<{
  settings: LoanSettings;
  update: (p: Partial<LoanSettings>) => void;
  save: () => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  isDemo: boolean;
  savedAt: string | null;
  siteValue: number;
  intro?: boolean;
}> = ({ settings: s, update, save, saveState, isDemo, savedAt, siteValue, intro }) => {
  const nowYear = new Date().getFullYear();
  const loanTooHigh = s.monthlyLoan > MAX_LENING_PER_MAAND;
  const monthsLeft = Math.max(0, ymDiff(s.asOf, s.lastLoanMonth));
  return (
    <Card
      title={intro ? 'Vul je gegevens in' : 'Jouw gegevens'}
      subtitle={
        intro
          ? 'Kijk in Mijn DUO voor je schuld en in de DEGIRO-app voor je waarde. Na opslaan zie je hier je hele overzicht.'
          : 'Pas aan en druk op Opslaan. De berekening hierboven verandert meteen mee.'
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <NumberField label="Schuld nu (Mijn DUO)" prefix="€" value={s.debtNow} onChange={(n) => update({ debtNow: n })} placeholder="bv. 8.420,00" hint="Je totale studieschuld inclusief rente" />
        <MonthField label="Die schuld klopt in" value={s.asOf} onChange={(v) => update({ asOf: v })} minYear={nowYear - 2} maxYear={nowYear + 1} />
        <NumberField
          label="Lening per maand"
          prefix="€"
          value={s.monthlyLoan}
          onChange={(n) => update({ monthlyLoan: n })}
          placeholder="bv. 600"
          hint={loanTooHigh ? `Let op: het maximum is ${formatEuroPrecise(MAX_LENING_PER_MAAND)} per maand (2026)` : 'Alleen het deel dat je moet terugbetalen'}
        />
        <NumberField
          label="Deel dat geen lening is"
          prefix="€"
          value={s.monthlyGrant}
          onChange={(n) => update({ monthlyGrant: n })}
          hint="Basisbeurs: wordt een gift als je binnen 10 jaar je diploma haalt"
        />
        <MonthField label="Einde bachelor" value={s.bachelorEnd} onChange={(v) => update({ bachelorEnd: v })} minYear={nowYear} maxYear={nowYear + 6} />
        <MonthField
          label="Laatste maand dat je leent"
          value={s.lastLoanMonth}
          onChange={(v) => update({ lastLoanMonth: v })}
          minYear={nowYear}
          maxYear={nowYear + 8}
          hint={`Nog ${monthsLeft} ${monthsLeft === 1 ? 'maand' : 'maanden'} lenen`}
        />
        <NumberField label="Je leeftijd nu" suffix="jaar" value={s.ageNow} onChange={(n) => update({ ageNow: Math.round(n) })} />
        <NumberField
          label="Rente na 2027 (aanname)"
          suffix="%"
          percent
          value={s.rateLater}
          onChange={(n) => update({ rateLater: n })}
          hint="2026 en 2027 zijn bekend; daarna weet niemand het zeker"
        />
        <NumberField label="Extra aflossen per maand" prefix="€" value={s.extraPerMonth} onChange={(n) => update({ extraPerMonth: n })} hint="Bovenop het DUO-maandbedrag, vanaf het begin van terugbetalen" />
        <NumberField
          label="Verwacht bruto jaarsalaris (optioneel)"
          prefix="€"
          value={s.salary}
          onChange={(n) => update({ salary: n })}
          hint={`Voor de draagkracht: je betaalt nooit meer dan 4% van wat je boven ${formatEuro(DRAAGKRACHT_VRIJSTELLING)} verdient. Leeg = volledig DUO-bedrag.`}
        />
        <NumberField label="Totale waarde op DEGIRO" prefix="€" value={s.degiroTotal} onChange={(n) => update({ degiroTotal: n })} hint={
          siteValue > 0 ? (
            <button type="button" onClick={() => update({ degiroTotal: Math.round(siteValue + s.degiroCash) })} className="font-semibold text-[rgb(var(--accent-text))] hover:underline">
              Gebruik de waarde van deze site (<Private>{formatEuro(siteValue)}</Private> + vrije ruimte)
            </button>
          ) : (
            'Inclusief vrije ruimte'
          )
        } />
        <NumberField label="Waarvan vrije ruimte" prefix="€" value={s.degiroCash} onChange={(n) => update({ degiroCash: n })} hint="Geld op DEGIRO dat nog niet belegd is" />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 no-print">
        <button
          type="button"
          onClick={save}
          disabled={isDemo || saveState === 'saving'}
          className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--series-1))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saveState === 'saved' ? <Check className="w-4 h-4" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          {saveState === 'saving' ? 'Opslaan…' : saveState === 'saved' ? 'Opgeslagen' : 'Opslaan'}
        </button>
        <p className="text-xs text-[rgb(var(--text-muted))]" role="status">
          {isDemo
            ? 'In de demo wordt niets opgeslagen.'
            : saveState === 'error'
              ? 'Opslaan mislukt, probeer het opnieuw.'
              : savedAt
                ? `Laatst opgeslagen op ${new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt))}. Alleen zichtbaar na inloggen.`
                : 'Wordt bewaard in je eigen database, niet in de openbare code.'}
        </p>
      </div>
    </Card>
  );
};

// ---------- snel invullen met een code ----------

const QuickFill: React.FC<{ onApply: (code: string) => boolean }> = ({ onApply }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(!onApply(code));
  };
  return (
    <Card title="Snel invullen" subtitle="Heb je een invulcode van Claude gekregen? Plak hem hier: alles wordt ingevuld en opgeslagen.">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          placeholder="duo1:…"
          aria-label="Invulcode"
          spellCheck={false}
          autoComplete="off"
          className={`flex-1 min-w-0 rounded-xl border bg-[rgb(var(--surface))] px-3 py-2.5 text-sm font-mono text-[rgb(var(--text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--series-1))]/40 ${
            error ? 'border-[rgb(var(--status-critical))]' : 'border-[rgb(var(--border))]'
          }`}
        />
        <button
          type="submit"
          disabled={!code.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[rgb(var(--series-1))] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          Invullen en opslaan
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-[rgb(var(--status-critical))]">Deze code klopt niet. Kopieer hem nog een keer helemaal, inclusief "duo1:".</p>}
    </Card>
  );
};

// ---------- uitleg ----------

const HowItWorks: React.FC = () => (
  <Card title="Zo werkt het bij DUO">
    <ul className="space-y-2.5 text-sm text-[rgb(var(--text-secondary))]">
      {[
        'Tijdens je studie komt er elke maand rente bij, ook over de rente van eerder. De rente staat steeds 1 jaar vast.',
        'Stop je met studiefinanciering, dan begint op 1 januari daarna de aanloopfase van 2 jaar. Je betaalt dan nog niets terug, maar de rente loopt door. Je mag wel altijd vrijwillig aflossen.',
        'Vanaf de aanloopfase staat de rente 5 jaar vast. Daarna 35 jaar terugbetalen met een vast maandbedrag dat DUO uitrekent (opnieuw bij elke nieuwe renteperiode).',
        'Verdien je weinig, dan betaal je minder: hooguit 4% van je inkomen boven de vrijstelling. Wat er na 35 jaar over is, hoef je niet meer te betalen.',
        'De basisbeurs (het deel dat geen lening is) wordt een gift als je binnen 10 jaar je diploma haalt. Haal je geen diploma, dan wordt het alsnog een lening.',
      ].map((t) => (
        <li key={t} className="flex gap-2.5">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-[rgb(var(--text-muted))]" aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
    <p className="mt-4 text-xs text-[rgb(var(--text-muted))]">
      Dit is een schatting met de regels van oktober 2026, geen advies. Je echte bedragen staan in Mijn DUO.{' '}
      <a href="https://duo.nl/particulier/rente/rente-voor-studenten.jsp" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-[rgb(var(--accent-text))] hover:underline">
        Rente bij DUO <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </a>
    </p>
  </Card>
);
