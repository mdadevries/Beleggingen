import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { TransactionType } from '../data/types.ts';

/** Kopen/verkopen als icoon + label i.p.v. kleur alleen (WCAG). */
export const TransactionBadge: React.FC<{ type: TransactionType }> = ({ type }) => {
  const isBuy = type === 'Kopen';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
        isBuy
          ? 'bg-[rgb(var(--status-good-bg))]/10 border-[rgb(var(--status-good-bg))]/30 text-[rgb(var(--status-good))]'
          : 'bg-[rgb(var(--status-critical))]/10 border-[rgb(var(--status-critical))]/30 text-[rgb(var(--status-critical))]'
      }`}
    >
      {isBuy ? (
        <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
      )}
      {type}
    </span>
  );
};
