alter table public.profiles enable row level security;

create policy "profile_owner_access"
on public.profiles
for all
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tasks',
    'tags',
    'task_tags',
    'task_dependencies',
    'daily_plans',
    'daily_priorities',
    'time_blocks',
    'work_sessions',
    'daily_reflections',
    'schedule_shares'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "owner_access" on public.%I for all to authenticated
       using ((select auth.uid()) = user_id)
       with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end
$$;

revoke all on public.schedule_shares from anon;
