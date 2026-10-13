-- 동네별 네이버 부동산 매물 링크를 저장합니다.
-- Supabase SQL Editor에서 한 번 실행하세요. 기존 동네 데이터는 유지됩니다.

alter table public.neighborhoods
  add column if not exists property_url text;
