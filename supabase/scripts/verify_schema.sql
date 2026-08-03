-- Timebox 운영 DB 필수 스키마 확인용 읽기 전용 SQL입니다.
-- Supabase SQL Editor에서 실행한 뒤 모든 행이 `ok`인지 확인하세요.

with checks as (
  select
    'weekly_goals 테이블'::text as item,
    to_regclass('public.weekly_goals') is not null as passed
  union all
  select
    'time_blocks.change_reasons 컬럼',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'time_blocks'
        and column_name = 'change_reasons'
        and data_type = 'jsonb'
    )
  union all
  select
    'schedule_change_events.reason 컬럼',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'schedule_change_events'
        and column_name = 'reason'
        and data_type = 'text'
    )
  union all
  select
    'close_daily_plan 함수',
    to_regprocedure('public.close_daily_plan(uuid)') is not null
  union all
  select
    'get_shared_schedule 함수',
    to_regprocedure('public.get_shared_schedule(text)') is not null
  union all
  select
    'weekly_goals RLS',
    coalesce((
      select relrowsecurity
      from pg_class
      where oid = to_regclass('public.weekly_goals')
    ), false)
  union all
  select
    'time_blocks RLS',
    coalesce((
      select relrowsecurity
      from pg_class
      where oid = to_regclass('public.time_blocks')
    ), false)
  union all
  select
    'schedule_change_events RLS',
    coalesce((
      select relrowsecurity
      from pg_class
      where oid = to_regclass('public.schedule_change_events')
    ), false)
)
select
  item,
  case when passed then 'ok' else 'missing' end as status
from checks
order by passed, item;
