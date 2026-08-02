create or replace view public.daily_timebox_metrics
with (security_invoker = true)
as
select
  p.user_id,
  p.id as daily_plan_id,
  p.plan_date,
  coalesce(sum(extract(epoch from (b.baseline_end - b.baseline_start)) / 60)
    filter (where b.baseline_start is not null), 0)::integer as baseline_minutes,
  coalesce(sum(extract(epoch from (b.planned_end - b.planned_start)) / 60), 0)::integer
    as planned_minutes,
  coalesce(sum(extract(epoch from (s.ended_at - s.started_at)) / 60)
    filter (where s.ended_at is not null), 0)::integer as actual_minutes,
  count(*) filter (where b.kind = 'task')::integer as task_blocks,
  count(*) filter (where b.kind = 'task' and b.status = 'completed')::integer
    as completed_task_blocks
from public.daily_plans p
left join public.time_blocks b
  on b.daily_plan_id = p.id and b.status <> 'cancelled'
left join public.work_sessions s on s.time_block_id = b.id
group by p.user_id, p.id, p.plan_date;

revoke all on public.daily_timebox_metrics from anon;
grant select on public.daily_timebox_metrics to authenticated;

-- 공유 토큰 원문은 저장하지 않는다. 앱에서 32바이트 토큰을 생성한 뒤
-- digest(token, 'sha256') 결과만 schedule_shares.token_hash에 저장한다.
create or replace function public.get_shared_schedule(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'date', p.plan_date,
    'timezone', p.timezone,
    'blocks', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'title', case when sh.include_task_details then b.title else b.kind end,
          'kind', b.kind,
          'start', b.planned_start,
          'end', b.planned_end,
          'status', b.status
        ) order by b.planned_start
      ) filter (where b.id is not null),
      '[]'::jsonb
    )
  )
  from public.schedule_shares sh
  join public.daily_plans p on p.id = sh.daily_plan_id
  left join public.time_blocks b
    on b.daily_plan_id = p.id and b.status <> 'cancelled'
  where sh.token_hash = extensions.digest(p_token, 'sha256')
    and sh.revoked_at is null
    and (sh.expires_at is null or sh.expires_at > now())
  group by p.id, p.plan_date, p.timezone;
$$;

revoke all on function public.get_shared_schedule(text) from public;
grant execute on function public.get_shared_schedule(text) to anon, authenticated;
