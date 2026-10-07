-- Plak dit in Supabase -> SQL Editor -> Run.
create table if not exists public.stocks (
  ticker        text primary key,
  name          text not null,
  current_price numeric not null,
  color_slot    smallint not null check (color_slot between 1 and 5),
  isin          text,
  symbol        text
);

create table if not exists public.transactions (
  id        text primary key,               -- DEGIRO OrderID
  date      date not null,
  ticker    text not null references public.stocks(ticker) on delete cascade,
  type      text not null check (type in ('Kopen', 'Verkopen')),
  quantity  numeric not null check (quantity > 0),
  price     numeric not null check (price > 0)
);
create index if not exists transactions_date_idx on public.transactions (date);

create table if not exists public.quote_cache (
  key        text primary key,
  body       jsonb not null,
  expires_at timestamptz not null
);

-- Row Level Security aan, zonder policies: de publieke (anon) sleutel kan dan niets lezen
-- of schrijven. Alleen de server (service_role-sleutel in Vercel) heeft toegang.
alter table public.stocks       enable row level security;
alter table public.transactions enable row level security;
alter table public.quote_cache  enable row level security;

-- Alleen de server (service_role) mag erbij. Dit staat er expliciet in, zodat het ook
-- werkt als "Automatically expose new tables" uit staat. anon/authenticated krijgen niets.
grant usage on schema public to service_role;
grant all on public.stocks, public.transactions, public.quote_cache to service_role;
