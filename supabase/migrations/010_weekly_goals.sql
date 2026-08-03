create table public.weekly_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  target_minutes integer not null
    check (target_minutes between 60 and 10080 and target_minutes % 30 = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create trigger weekly_goals_set_updated_at
before update on public.weekly_goals
for each row execute function public.set_updated_at();

alter table public.weekly_goals enable row level security;

create policy "owner_access"
on public.weekly_goals
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.weekly_goals from anon;
