create or replace function public.prevent_future_plan_close()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'closed'
    and old.status is distinct from 'closed'
    and new.plan_date > (now() at time zone new.timezone)::date
  then
    raise exception 'Future plans cannot be closed before their plan date'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_plans_prevent_future_close on public.daily_plans;
create trigger daily_plans_prevent_future_close
before update of status on public.daily_plans
for each row
execute function public.prevent_future_plan_close();

revoke all on function public.prevent_future_plan_close() from public, anon, authenticated;
