create or replace function public.prevent_new_active_task_duplicates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_id is null or new.status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.daily_plan_id is not distinct from old.daily_plan_id
    and new.task_id is not distinct from old.task_id
    and old.status <> 'cancelled'
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.daily_plan_id::text || ':' || new.task_id::text, 0)
  );

  if exists (
    select 1
    from public.time_blocks as existing
    where existing.daily_plan_id = new.daily_plan_id
      and existing.task_id = new.task_id
      and existing.status <> 'cancelled'
      and existing.id <> new.id
  ) then
    raise exception 'Task already has an active block in this daily plan'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_new_active_task_duplicates on public.time_blocks;
create trigger prevent_new_active_task_duplicates
before insert or update of daily_plan_id, task_id, status
on public.time_blocks
for each row execute function public.prevent_new_active_task_duplicates();

revoke execute on function public.prevent_new_active_task_duplicates() from public, anon, authenticated;
