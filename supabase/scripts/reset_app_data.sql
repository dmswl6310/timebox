-- DANGER: Timebox의 모든 앱 데이터를 되돌릴 수 없게 삭제합니다.
-- Supabase SQL Editor에서 필요할 때만 수동으로 실행하세요.
--
-- 유지되는 항목:
--   - auth.users 로그인 계정
--   - public 스키마, 함수, 트리거, RLS 정책, 마이그레이션 기록
--
-- 삭제되는 항목:
--   - 프로필, 할 일, 태그, 날짜별 계획, 우선순위, 타임블록
--   - 실제 수행 시간, 일기, 공유 링크, 주간 목표, 일정 변경 기록

begin;

truncate table
  public.schedule_change_events,
  public.weekly_goals,
  public.work_sessions,
  public.daily_reflections,
  public.schedule_shares,
  public.daily_priorities,
  public.time_blocks,
  public.task_dependencies,
  public.task_tags,
  public.tags,
  public.tasks,
  public.daily_plans,
  public.profiles;

commit;

-- 실행 결과 확인
select 'profiles' as table_name, count(*)::bigint as row_count from public.profiles
union all select 'tasks', count(*) from public.tasks
union all select 'tags', count(*) from public.tags
union all select 'task_tags', count(*) from public.task_tags
union all select 'task_dependencies', count(*) from public.task_dependencies
union all select 'daily_plans', count(*) from public.daily_plans
union all select 'daily_priorities', count(*) from public.daily_priorities
union all select 'time_blocks', count(*) from public.time_blocks
union all select 'work_sessions', count(*) from public.work_sessions
union all select 'daily_reflections', count(*) from public.daily_reflections
union all select 'schedule_shares', count(*) from public.schedule_shares
union all select 'weekly_goals', count(*) from public.weekly_goals
union all select 'schedule_change_events', count(*) from public.schedule_change_events
order by table_name;
