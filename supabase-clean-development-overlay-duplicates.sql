-- 보조 경계 저장 오류로 생긴 "같은 동네 · 같은 이름 · 같은 경계" 중복만 제거합니다.
-- 라벨 좌표가 있는 행을 우선 보존합니다. 둘 다 좌표가 있으면 생성 시각, ID 내림차순입니다.
-- 좌표 수정 시각이 없으므로, 서로 다른 수동 좌표끼리의 최신 수정 순서는 알 수 없습니다.
-- 삭제 행은 development_overlay_duplicate_backup에 보관하며 실패하면 전체 롤백합니다.
begin;

lock table public.development_overlays in share row exclusive mode;

create table if not exists public.development_overlay_duplicate_backup as
select * from public.development_overlays with no data;

-- 일반 이용자는 백업에 접근할 수 없습니다. SQL Editor에서는 확인·복구 가능합니다.
alter table public.development_overlay_duplicate_backup enable row level security;

with ranked_overlays as (
  select
    id,
    row_number() over (
      partition by neighborhood_id, coalesce(name, ''), polygon
      order by
        (label_lat is not null and label_lng is not null) desc,
        created_at desc,
        id desc
    ) as duplicate_rank
  from public.development_overlays
), removed_overlays as (
  delete from public.development_overlays as overlay
  using ranked_overlays
  where overlay.id = ranked_overlays.id
    and ranked_overlays.duplicate_rank > 1
  returning overlay.*
)
insert into public.development_overlay_duplicate_backup
select removed.* from removed_overlays as removed
where not exists (
  select 1 from public.development_overlay_duplicate_backup as backup
  where backup.id = removed.id
);

commit;
