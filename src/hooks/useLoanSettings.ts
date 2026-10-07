import { useCallback, useEffect, useState } from 'react';
import { LoanSettings, ymFormat } from '../utils/studyLoan.ts';

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

  const save = useCallback(() => {
    if (isDemo || !settings) return;
    setSaveState('saving');
    fetch('/api/loan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
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
  }, [isDemo, settings]);

  return { settings, update, save, saveState, hasSaved, savedAt, loadError };
}
