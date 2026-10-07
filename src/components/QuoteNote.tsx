import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { QuoteStatus } from '../hooks/usePortfolioData.ts';

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );

/** Eerlijk zeggen waar de koersen vandaan komen en wanneer ze voor het laatst zijn bijgewerkt. */
export const QuoteNote: React.FC<{ status: QuoteStatus | null; refreshing?: boolean; onRefresh?: () => void }> = ({
  status,
  refreshing = false,
  onRefresh,
}) => {
  let text: string;
  if (status === null) {
    text = 'Koersen worden opgehaald…';
  } else if (status.total > 0 && status.live === status.total) {
    const when = status.updatedAt ?? status.asOf;
    text = `Koersen bijgewerkt op ${when ? fmt(when) : 'onbekend moment'}. Elke werkdag na beurssluiting volgt automatisch een nieuwe update.`;
  } else if (status.live === 0) {
    text = 'Koersen niet beschikbaar: waarde en resultaat zijn gebaseerd op je laatste transactieprijs per aandeel.';
  } else {
    const when = status.updatedAt ?? status.asOf;
    text = `${status.live} van ${status.total} aandelen met koers${when ? ` (bijgewerkt ${fmt(when)})` : ''}; de rest staat op de laatste transactieprijs.`;
  }

  return (
    <p className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[rgb(var(--text-muted))]" role="status">
      <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
      {onRefresh && status !== null && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-[rgb(var(--accent-text))] hover:bg-[rgb(var(--surface-sunken))] disabled:opacity-60"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshing ? 'Bezig…' : 'Nu verversen'}
        </button>
      )}
    </p>
  );
};
