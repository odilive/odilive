-- 보조 경계 저장 오류로 생긴 "같은 동네 · 같은 이름 · 같은 경계" 중복만 제거합니다.
-- 각 묶음에서 가장 먼저 만들어진 1개를 남깁니다.
with ranked_overlays as (
  select
    id,
    row_number() over (
      partition by neighborhood_id, coalesce(name, ''), polygon
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.development_overlays
)
delete from public.development_overlays as overlay
using ranked_overlays
where overlay.id = ranked_overlays.id
  and ranked_overlays.duplicate_rank > 1;
