alter table public.time_blocks
  drop constraint if exists time_blocks_change_reasons_object_check;

alter table public.time_blocks
  add constraint time_blocks_change_reasons_object_check
  check (
    jsonb_typeof(change_reasons) = 'object'
    and change_reasons - array['created', 'moved', 'resized', 'cancelled']::text[] = '{}'::jsonb
    and (
      not (change_reasons ? 'created')
      or (
        jsonb_typeof(change_reasons -> 'created') = 'string'
        and char_length(trim(change_reasons ->> 'created')) between 1 and 500
      )
    )
    and (
      not (change_reasons ? 'moved')
      or (
        jsonb_typeof(change_reasons -> 'moved') = 'string'
        and char_length(trim(change_reasons ->> 'moved')) between 1 and 500
      )
    )
    and (
      not (change_reasons ? 'resized')
      or (
        jsonb_typeof(change_reasons -> 'resized') = 'string'
        and char_length(trim(change_reasons ->> 'resized')) between 1 and 500
      )
    )
    and (
      not (change_reasons ? 'cancelled')
      or (
        jsonb_typeof(change_reasons -> 'cancelled') = 'string'
        and char_length(trim(change_reasons ->> 'cancelled')) between 1 and 500
      )
    )
  );

alter table public.schedule_change_events
  drop constraint if exists schedule_change_events_reason_length_check;

alter table public.schedule_change_events
  add constraint schedule_change_events_reason_length_check
  check (reason is null or char_length(trim(reason)) between 1 and 500);
