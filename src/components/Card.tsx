import React from 'react';

export const Card: React.FC<{
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, children, className = '' }) => (
  <section
    className={`rounded-2xl bg-[rgb(var(--surface))] border border-[rgb(var(--border))] p-4 sm:p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${className}`}
  >
    {(title || action) && (
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {title && <h2 className="text-sm font-bold text-[rgb(var(--text-primary))]">{title}</h2>}
          {subtitle && <p className="text-xs text-[rgb(var(--text-muted))] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);
