create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Seoul',
  day_start time not null default '06:00',
  day_end time not null default '23:00',
  snap_minutes smallint not null default 15 check (snap_minutes in (15, 30, 60)),
  default_buffer_minutes smallint not null default 15
    check (default_buffer_minutes in (0, 5, 10, 15, 30)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  notes text not null default '',
  first_action text,
  estimate_minutes smallint
    check (estimate_minutes between 15 and 480 and estimate_minutes % 15 = 0),
  energy_required smallint check (energy_required between 1 and 5),
  preferred_period text
    check (preferred_period in ('any', 'morning', 'afternoon', 'evening')),
  status text not null default 'inbox'
    check (status in ('inbox', 'completed', 'archived', 'discarded')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  color text not null default '#64748b',
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create unique index tags_user_name_uidx on public.tags (user_id, lower(name));

create table public.task_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  tag_id uuid not null,
  primary key (task_id, tag_id),
  foreign key (user_id, task_id) references public.tasks(user_id, id),
  foreign key (user_id, tag_id) references public.tags(user_id, id)
);

create table public.task_dependencies (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  depends_on_task_id uuid not null,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id),
  foreign key (user_id, task_id) references public.tasks(user_id, id),
  foreign key (user_id, depends_on_task_id) references public.tasks(user_id, id)
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  timezone text not null,
  status text not null default 'draft'
    check (status in ('draft', 'committed', 'closed')),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date),
  unique (user_id, id)
);

create table public.daily_priorities (
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_plan_id uuid not null,
  task_id uuid not null,
  rank smallint not null check (rank between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (daily_plan_id, task_id),
  unique (daily_plan_id, rank),
  foreign key (user_id, daily_plan_id)
    references public.daily_plans(user_id, id) on delete cascade,
  foreign key (user_id, task_id) references public.tasks(user_id, id)
);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_plan_id uuid not null,
  task_id uuid,
  kind text not null check (kind in ('task', 'planning', 'buffer', 'appointment')),
  title text not null check (char_length(trim(title)) > 0),
  planned_start timestamptz not null,
  planned_end timestamptz not null,
  baseline_start timestamptz,
  baseline_end timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'skipped', 'cancelled')),
  is_locked boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  check (planned_end > planned_start),
  check (extract(epoch from planned_end - planned_start)::integer % 900 = 0),
  check (baseline_end is null or baseline_start is null or baseline_end > baseline_start),
  check (kind <> 'task' or task_id is not null),
  foreign key (user_id, daily_plan_id)
    references public.daily_plans(user_id, id) on delete cascade,
  foreign key (user_id, task_id) references public.tasks(user_id, id)
);

create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_block_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'timer' check (source in ('timer', 'manual')),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  foreign key (user_id, time_block_id)
    references public.time_blocks(user_id, id) on delete cascade
);

create table public.daily_reflections (
  daily_plan_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  mood smallint check (mood between 1 and 5),
  wins jsonb not null default '[]'::jsonb,
  distractions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, daily_plan_id)
    references public.daily_plans(user_id, id) on delete cascade
);

create table public.schedule_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_plan_id uuid not null,
  token_hash bytea not null unique,
  include_task_details boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, daily_plan_id)
    references public.daily_plans(user_id, id) on delete cascade
);

create index tasks_inbox_idx on public.tasks(user_id, status, created_at desc);
create index task_tags_user_idx on public.task_tags(user_id, task_id);
create index daily_plans_user_date_idx on public.daily_plans(user_id, plan_date desc);
create index time_blocks_plan_start_idx
  on public.time_blocks(daily_plan_id, planned_start) where status <> 'cancelled';
create index time_blocks_user_task_idx on public.time_blocks(user_id, task_id);
create index work_sessions_block_start_idx
  on public.work_sessions(time_block_id, started_at);
create index work_sessions_user_start_idx
  on public.work_sessions(user_id, started_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger daily_plans_set_updated_at before update on public.daily_plans
for each row execute function public.set_updated_at();
create trigger time_blocks_set_updated_at before update on public.time_blocks
for each row execute function public.set_updated_at();
create trigger daily_reflections_set_updated_at before update on public.daily_reflections
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
