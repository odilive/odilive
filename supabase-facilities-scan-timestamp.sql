-- 편의점·빨래방·약국(편빨약) 데이터의 마지막 스캔 시각을 저장합니다.
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.neighborhoods
  add column if not exists facilities_scanned_at timestamptz;
