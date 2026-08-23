-- 이용자 의견 보내기용 테이블입니다.
-- Supabase SQL Editor에서 한 번 실행하세요.

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  area text,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  email text,
  inbox_state text not null default 'inbox' check (inbox_state in ('inbox', 'done', 'trash')),
  created_at timestamptz not null default now()
);

-- 이미 이전 초안을 실행했다면, 사용하지 않는 분류·상태 칼럼만 정리합니다.
alter table public.feedback_submissions
  drop column if exists category,
  drop column if exists status,
  drop column if exists contact;

alter table public.feedback_submissions
  add column if not exists inbox_state text not null default 'inbox'
  check (inbox_state in ('inbox', 'done', 'trash'));

alter table public.feedback_submissions enable row level security;

drop policy if exists "Anyone can send feedback" on public.feedback_submissions;
drop policy if exists "Authenticated read feedback" on public.feedback_submissions;
drop policy if exists "Authenticated update feedback" on public.feedback_submissions;
drop policy if exists "Authenticated delete feedback" on public.feedback_submissions;

create policy "Anyone can send feedback"
on public.feedback_submissions for insert
to anon, authenticated
with check (char_length(trim(message)) between 1 and 2000);

create policy "Authenticated read feedback"
on public.feedback_submissions for select
to authenticated
using (true);

create policy "Authenticated update feedback"
on public.feedback_submissions for update
to authenticated
using (true)
with check (true);

create policy "Authenticated delete feedback"
on public.feedback_submissions for delete
to authenticated
using (true);
