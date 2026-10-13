-- Weekrapport: plak dit in Supabase -> SQL Editor -> Run. (Veilig om opnieuw te draaien.)
-- Eén rij per week. n8n schrijft het rapport via /api/reports, de site leest het via dezelfde route.
create table if not exists public.weekly_reports (
  week_start date primary key,              -- maandag van de week waar het rapport over gaat
  week_end   date not null,                 -- zondag
  created_at timestamptz not null default now(),
  model      text,                          -- welk AI-model het schreef
  stats      jsonb not null,                -- cijfers, uitgerekend door n8n (niet door de AI)
  content    jsonb not null                 -- tekst van de AI (kop, samenvatting, kanttekeningen)
);

-- Zelfde beveiliging als de andere tabellen: alleen de server (service_role) heeft toegang.
alter table public.weekly_reports enable row level security;
grant all on public.weekly_reports to service_role;
