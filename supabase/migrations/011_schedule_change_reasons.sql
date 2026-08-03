alter table public.time_blocks
  add column if not exists change_reasons jsonb not null default '{}'::jsonb;

alter table public.schedule_change_events
  add column if not exists reason text;

alter table public.time_blocks
  drop constraint if exists time_blocks_change_reasons_object_check;

alter table public.time_blocks
  add constraint time_blocks_change_reasons_object_check
  check (jsonb_typeof(change_reasons) = 'object');

alter table public.schedule_change_events
  drop constraint if exists schedule_change_events_reason_length_check;

alter table public.schedule_change_events
  add constraint schedule_change_events_reason_length_check
  check (reason is null or char_length(reason) <= 500);

create or replace function public.close_daily_plan(p_daily_plan_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  plan_timezone text;
  inserted_count integer := 0;
  affected_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select timezone
  into plan_timezone
  from public.daily_plans
  where id = p_daily_plan_id
    and user_id = current_user_id;

  if plan_timezone is null then
    raise exception 'Daily plan not found' using errcode = 'P0002';
  end if;

  delete from public.schedule_change_events
  where daily_plan_id = p_daily_plan_id
    and user_id = current_user_id;

  insert into public.schedule_change_events (
    user_id, daily_plan_id, time_block_id, change_type, before_state, after_state, reason
  )
  select
    current_user_id,
    p_daily_plan_id,
    block.id,
    'created',
    null,
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.planned_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.planned_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.planned_end - block.planned_start)) / 60)::integer,
      'status', block.status
    ),
    block.change_reasons ->> 'created'
  from public.time_blocks as block
  where block.daily_plan_id = p_daily_plan_id
    and block.user_id = current_user_id
    and block.baseline_start is null
    and block.status <> 'cancelled';
  get diagnostics affected_count = row_count;
  inserted_count := inserted_count + affected_count;

  insert into public.schedule_change_events (
    user_id, daily_plan_id, time_block_id, change_type, before_state, after_state, reason
  )
  select
    current_user_id,
    p_daily_plan_id,
    block.id,
    'cancelled',
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.baseline_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.baseline_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.baseline_end - block.baseline_start)) / 60)::integer,
      'status', 'scheduled'
    ),
    jsonb_build_object('status', 'cancelled'),
    block.change_reasons ->> 'cancelled'
  from public.time_blocks as block
  where block.daily_plan_id = p_daily_plan_id
    and block.user_id = current_user_id
    and block.baseline_start is not null
    and block.status = 'cancelled';
  get diagnostics affected_count = row_count;
  inserted_count := inserted_count + affected_count;

  insert into public.schedule_change_events (
    user_id, daily_plan_id, time_block_id, change_type, before_state, after_state, reason
  )
  select
    current_user_id,
    p_daily_plan_id,
    block.id,
    'moved',
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.baseline_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.baseline_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.baseline_end - block.baseline_start)) / 60)::integer
    ),
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.planned_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.planned_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.planned_end - block.planned_start)) / 60)::integer
    ),
    block.change_reasons ->> 'moved'
  from public.time_blocks as block
  where block.daily_plan_id = p_daily_plan_id
    and block.user_id = current_user_id
    and block.baseline_start is not null
    and block.status <> 'cancelled'
    and block.planned_start <> block.baseline_start;
  get diagnostics affected_count = row_count;
  inserted_count := inserted_count + affected_count;

  insert into public.schedule_change_events (
    user_id, daily_plan_id, time_block_id, change_type, before_state, after_state, reason
  )
  select
    current_user_id,
    p_daily_plan_id,
    block.id,
    'resized',
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.baseline_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.baseline_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.baseline_end - block.baseline_start)) / 60)::integer
    ),
    jsonb_build_object(
      'title', block.title,
      'start', extract(hour from block.planned_start at time zone plan_timezone)::integer * 60
        + extract(minute from block.planned_start at time zone plan_timezone)::integer,
      'duration', round(extract(epoch from (block.planned_end - block.planned_start)) / 60)::integer
    ),
    block.change_reasons ->> 'resized'
  from public.time_blocks as block
  where block.daily_plan_id = p_daily_plan_id
    and block.user_id = current_user_id
    and block.baseline_start is not null
    and block.status <> 'cancelled'
    and (block.planned_end - block.planned_start) <> (block.baseline_end - block.baseline_start);
  get diagnostics affected_count = row_count;
  inserted_count := inserted_count + affected_count;

  update public.daily_plans
  set status = 'closed'
  where id = p_daily_plan_id
    and user_id = current_user_id;

  return inserted_count;
end;
$$;

revoke all on function public.close_daily_plan(uuid) from public, anon;
grant execute on function public.close_daily_plan(uuid) to authenticated;
