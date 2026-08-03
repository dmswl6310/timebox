create index if not exists schedule_change_events_user_plan_idx
  on public.schedule_change_events(user_id, daily_plan_id);
