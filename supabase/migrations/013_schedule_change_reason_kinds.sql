alter table public.time_blocks
  add column if not exists change_reason_kinds jsonb not null default '{}'::jsonb;

alter table public.schedule_change_events
  add column if not exists reason_kind text;

alter table public.time_blocks
  drop constraint if exists time_blocks_change_reason_kinds_check;

alter table public.time_blocks
  add constraint time_blocks_change_reason_kinds_check
  check (
    jsonb_typeof(change_reason_kinds) = 'object'
    and change_reason_kinds - array['created', 'moved', 'resized', 'cancelled']::text[] = '{}'::jsonb
    and (not (change_reason_kinds ? 'created') or change_reason_kinds ->> 'created' in ('unexpected_delay', 'deliberate_defer', 'estimate_adjustment', 'new_event', 'reprioritized', 'other'))
    and (not (change_reason_kinds ? 'moved') or change_reason_kinds ->> 'moved' in ('unexpected_delay', 'deliberate_defer', 'estimate_adjustment', 'new_event', 'reprioritized', 'other'))
    and (not (change_reason_kinds ? 'resized') or change_reason_kinds ->> 'resized' in ('unexpected_delay', 'deliberate_defer', 'estimate_adjustment', 'new_event', 'reprioritized', 'other'))
    and (not (change_reason_kinds ? 'cancelled') or change_reason_kinds ->> 'cancelled' in ('unexpected_delay', 'deliberate_defer', 'estimate_adjustment', 'new_event', 'reprioritized', 'other'))
  );

alter table public.schedule_change_events
  drop constraint if exists schedule_change_events_reason_kind_check;

alter table public.schedule_change_events
  add constraint schedule_change_events_reason_kind_check
  check (
    reason_kind is null
    or reason_kind in (
      'unexpected_delay',
      'deliberate_defer',
      'estimate_adjustment',
      'new_event',
      'reprioritized',
      'other'
    )
  );
