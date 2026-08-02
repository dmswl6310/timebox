-- Trigger functions are not application APIs. Keep them callable only by triggers/owners.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Cover ownership/composite foreign keys used by RLS checks and joins.
create index if not exists task_tags_user_tag_idx
  on public.task_tags(user_id, tag_id);

create index if not exists task_dependencies_user_task_idx
  on public.task_dependencies(user_id, task_id);

create index if not exists task_dependencies_user_dependency_idx
  on public.task_dependencies(user_id, depends_on_task_id);

create index if not exists daily_priorities_user_plan_idx
  on public.daily_priorities(user_id, daily_plan_id);

create index if not exists daily_priorities_user_task_idx
  on public.daily_priorities(user_id, task_id);

create index if not exists time_blocks_user_plan_idx
  on public.time_blocks(user_id, daily_plan_id);

create index if not exists work_sessions_user_block_idx
  on public.work_sessions(user_id, time_block_id);

create index if not exists daily_reflections_user_plan_idx
  on public.daily_reflections(user_id, daily_plan_id);

create index if not exists schedule_shares_user_plan_idx
  on public.schedule_shares(user_id, daily_plan_id);

-- Aggregate sessions once per block before joining them to a plan.
-- This prevents planned duration and block counts from being multiplied when
-- a user pauses and resumes the same time block several times.
create or replace view public.daily_timebox_metrics
with (security_invoker = true)
as
with session_totals as (
  select
    s.user_id,
    s.time_block_id,
    coalesce(
      sum(extract(epoch from (s.ended_at - s.started_at)) / 60)
        filter (where s.ended_at is not null),
      0
    )::integer as actual_minutes
  from public.work_sessions s
  group by s.user_id, s.time_block_id
)
select
  p.user_id,
  p.id as daily_plan_id,
  p.plan_date,
  coalesce(
    sum(extract(epoch from (b.baseline_end - b.baseline_start)) / 60)
      filter (where b.baseline_start is not null),
    0
  )::integer as baseline_minutes,
  coalesce(
    sum(extract(epoch from (b.planned_end - b.planned_start)) / 60),
    0
  )::integer as planned_minutes,
  coalesce(sum(st.actual_minutes), 0)::integer as actual_minutes,
  count(b.id) filter (where b.kind = 'task')::integer as task_blocks,
  count(b.id) filter (
    where b.kind = 'task' and b.status = 'completed'
  )::integer as completed_task_blocks
from public.daily_plans p
left join public.time_blocks b
  on b.daily_plan_id = p.id
  and b.user_id = p.user_id
  and b.status <> 'cancelled'
left join session_totals st
  on st.time_block_id = b.id
  and st.user_id = b.user_id
group by p.user_id, p.id, p.plan_date;

revoke all on public.daily_timebox_metrics from anon;
grant select on public.daily_timebox_metrics to authenticated;
