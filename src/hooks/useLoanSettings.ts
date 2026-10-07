import { useCallback, useEffect, useState } from 'react';
import { LoanSettings, isYm, ymFormat } from '../utils/studyLoan.ts';

/** Voorbeeldgegevens voor de demo (verzonnen, geen echte persoon). */
export const DEMO_LOAN: LoanSettings = {
  debtNow: 8420,
  asOf: '2026-10',
  monthlyLoan: 600,
  monthlyGrant: 130.21,
  bachelorEnd: '2028-08',
  lastLoanMonth: '2028-08',
  ageNow: 21,
  rateLater: 0.027,
  extraPerMonth: 0,
  salary: 0,
  degiroTotal: 11180,
  degiroCash: 450,
};

/** Startwaarden als er nog niets is opgeslagen: bedragen leeg, data op een logische gok. */
function emptySettings(siteValue: number): LoanSettings {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const bachelorEnd = ymFormat(y + (m >= 9 ? 2 : 1), 8);
  return {
    debtNow: 0,
    asOf: ymFormat(y, m),
    monthlyLoan: 0,
    monthlyGrant: 0,
    bachelorEnd,
    lastLoanMonth: bachelorEnd,
    ageNow: 20,
    rateLater: 0.027,
    extraPerMonth: 0,
    salary: 0,
    degiroTotal: Math.round(siteValue),
    degiroCash: 0,
  };
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const CODE_PREFIX = 'duo1:';
const NUM_KEYS: (keyof LoanSettings)[] = [
  'debtNow', 'monthlyLoan', 'monthlyGrant', 'ageNow', 'rateLater', 'extraPerMonth', 'salary', 'degiroTotal', 'degiroCash',
];
const YM_KEYS: (keyof LoanSettings)[] = ['asOf', 'bachelorEnd', 'lastLoanMonth'];

/**
 * Leest een invulcode ("duo1:" + base64 van de gegevens). Zo kan Claude je gegevens klaarzetten
 * zonder dat ze in de openbare code staan. Onbekende of foute velden worden genegeerd.
 */
export function decodeLoanCode(code: string): Partial<LoanSettings> | null {
  const t = code.trim();
  if (!t.startsWith(CODE_PREFIX)) return null;
  try {
    const b64 = t.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    const raw = JSON.parse(decodeURIComponent(escape(atob(b64))));
    const out: Partial<LoanSettings> = {};
    for (const k of NUM_KEYS) if (typeof raw[k] === 'number' && Number.isFinite(raw[k]) && raw[k] >= 0) (out as any)[k] = raw[k];
    for (const k of YM_KEYS) if (isYm(raw[k])) (out as any)[k] = raw[k];
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Jouw instellingen voor de studieschuld-pagina. Echte sessie: uit /api/loan (database),
 * want de code is openbaar en dit zijn persoonlijke bedragen. Demo: vaste voorbeeldwaarden,
 * er wordt niets opgeslagen.
 */
export function useLoanSettings(isDemo: boolean, siteValue: number) {
  const [settings, setSettings] = useState<LoanSettings | null>(isDemo ? DEMO_LOAN : null);
  const [hasSaved, setHasSaved] = useState(isDemo);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isDemo) {
      setSettings(DEMO_LOAN);
      setHasSaved(true);
      return;
    }
    let cancelled = false;
    fetch('/api/loan')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { settings: LoanSettings | null; savedAt: string | null }) => {
        if (cancelled) return;
        if (d.settings) {
          setSettings({ ...emptySettings(siteValue), ...d.settings });
          setHasSaved(true);
          setSavedAt(d.savedAt);
        } else {
          setSettings(emptySettings(siteValue));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setSettings(emptySettings(siteValue));
      });
    return () => {
      cancelled = true;
    };
    // siteValue alleen als startwaarde: niet opnieuw laden als koersen binnenkomen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  const update = useCallback((patch: Partial<LoanSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setSaveState((st) => (st === 'saved' ? 'idle' : st));
  }, []);

  const saveSettings = useCallback((toSave: LoanSettings) => {
    if (isDemo) return;
    setSaveState('saving');
    fetch('/api/loan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: toSave }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { savedAt: string }) => {
        setSaveState('saved');
        setHasSaved(true);
        setSavedAt(d.savedAt);
      })
      .catch(() => setSaveState('error'));
  }, [isDemo]);

  const save = useCallback(() => {
    if (settings) saveSettings(settings);
  }, [settings, saveSettings]);

  /** Invulcode toepassen en meteen opslaan. Geeft false terug als de code niet klopt. */
  const applyCode = useCallback(
    (code: string): boolean => {
      const patch = decodeLoanCode(code);
      if (!patch || !settings) return false;
      const next = { ...settings, ...patch };
      setSettings(next);
      if (isDemo) {
        setHasSaved(true);
      } else {
        saveSettings(next);
      }
      return true;
    },
    [settings, isDemo, saveSettings]
  );

  return { settings, update, save, applyCode, saveState, hasSaved, savedAt, loadError };
}
