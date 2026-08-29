create table if not exists public.development_overlays (
  id uuid primary key default gen_random_uuid(),
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  name text,
  polygon jsonb not null,
  label_lat double precision,
  label_lng double precision,
  created_at timestamptz not null default now()
);

alter table public.development_overlays
  add column if not exists name text,
  add column if not exists label_lat double precision,
  add column if not exists label_lng double precision;

alter table public.development_overlays enable row level security;

drop policy if exists "Public read development overlays" on public.development_overlays;
drop policy if exists "Authenticated manage development overlays" on public.development_overlays;

create policy "Public read development overlays"
on public.development_overlays for select
to anon
using (true);

create policy "Authenticated manage development overlays"
on public.development_overlays for all
to authenticated
using (true)
with check (true);
