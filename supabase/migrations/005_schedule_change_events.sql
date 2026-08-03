create table if not exists public.schedule_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_plan_id uuid not null,
  time_block_id uuid,
  change_type text not null
    check (change_type in ('created', 'moved', 'resized', 'completed', 'reopened', 'cancelled')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  foreign key (user_id, daily_plan_id)
    references public.daily_plans(user_id, id) on delete cascade
);

create index if not exists schedule_change_events_user_created_idx
  on public.schedule_change_events(user_id, created_at desc);

create index if not exists schedule_change_events_plan_idx
  on public.schedule_change_events(daily_plan_id, created_at desc);

alter table public.schedule_change_events enable row level security;

create policy "owner_access"
on public.schedule_change_events
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
