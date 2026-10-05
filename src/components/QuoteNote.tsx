import React from 'react';
import { Activity } from 'lucide-react';
import { QuoteStatus } from '../hooks/usePortfolioData.ts';

/** Eerlijk zeggen waar de koersen vandaan komen (live of laatste transactieprijs). */
export const QuoteNote: React.FC<{ status: QuoteStatus | null }> = ({ status }) => {
  let text: string;
  if (status === null) {
    text = 'Koersen worden opgehaald…';
  } else if (status.total > 0 && status.live === status.total) {
    const when = status.asOf
      ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.asOf))
      : null;
    text = `Koersen: Yahoo Finance, licht vertraagd${when ? ` · laatste koers ${when}` : ''}.`;
  } else if (status.live === 0) {
    text = 'Live koersen niet beschikbaar: waarde en resultaat zijn gebaseerd op je laatste transactieprijs per aandeel.';
  } else {
    text = `${status.live} van ${status.total} aandelen met live koers; de rest staat op de laatste transactieprijs.`;
  }

  return (
    <p className="flex items-center gap-1.5 text-xs text-[rgb(var(--text-muted))]" role="status">
      <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
};
