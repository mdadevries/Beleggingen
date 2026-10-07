import React from 'react';
import { Download, Printer } from 'lucide-react';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { printPage } from '../utils/exportData.ts';

const btn =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs sm:text-sm font-medium text-[rgb(var(--text-secondary))] hover:bg-[rgb(var(--surface-sunken))] hover:text-[rgb(var(--text-primary))]';

/**
 * Exporteren: CSV voor Excel en een printvenster (waar je "Opslaan als pdf" kiest).
 * In de anonieme modus bestaat de CSV-knop niet, want daarin staan aantallen en bedragen.
 * Printen kan wel: dat toont wat er op het scherm staat, dus ook geanonimiseerd.
 */
export const ExportBar: React.FC<{ csvLabel: string; onCsv: () => void }> = ({ csvLabel, onCsv }) => {
  const { hidden } = usePrivacy();
  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      {!hidden && (
        <button type="button" onClick={onCsv} className={btn}>
          <Download className="w-4 h-4" aria-hidden="true" />
          {csvLabel}
        </button>
      )}
      <button type="button" onClick={printPage} className={btn}>
        <Printer className="w-4 h-4" aria-hidden="true" />
        Print of pdf
      </button>
    </div>
  );
};
