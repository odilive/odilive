create table if not exists public.development_overlays (
  id uuid primary key default gen_random_uuid(),
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  name text,
  polygon jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.development_overlays
  add column if not exists name text;

alter table public.development_overlays enable row level security;

create policy "Public read development overlays"
on public.development_overlays for select
to anon
using (true);

create policy "Authenticated manage development overlays"
on public.development_overlays for all
to authenticated
using (true)
with check (true);
