"use client";

import { createClient } from "@/lib/supabase/client";

export type ActivityKind = "plan" | "task" | "schedule" | "journal";

export type ActivityRecord = {
  id: string;
  occurredAt: string;
  date: string;
  kind: ActivityKind;
  title: string;
  detail: string;
};

export type DailyRecord = {
  date: string;
  plannedMinutes: number;
  actualMinutes: number;
  completedBlocks: number;
  totalBlocks: number;
  mood: number | null;
  journal: string;
  changeCount: number;
};

export type RecordBundle = {
  activities: ActivityRecord[];
  days: DailyRecord[];
  tagMinutes: Array<{ tag: string; date: string; minutes: number }>;
};

const EMPTY_BUNDLE: RecordBundle = { activities: [], days: [], tagMinutes: [] };

function minutesBetween(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

function localDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function loadRecordBundle(userId: string): Promise<RecordBundle> {
  const supabase = createClient();
  const { data: plans, error: planError } = await supabase
    .from("daily_plans")
    .select("id,plan_date,status,committed_at,created_at")
    .eq("user_id", userId)
    .order("plan_date", { ascending: false })
    .limit(1000);
  if (planError) throw new Error(planError.message);
  if (!plans?.length) return EMPTY_BUNDLE;

  const planIds = plans.map((plan) => plan.id);
  const [blocksResult, reflectionsResult, tasksResult, changesResult] = await Promise.all([
    supabase
      .from("time_blocks")
      .select("id,daily_plan_id,task_id,title,planned_start,planned_end,baseline_start,baseline_end,status,created_at,updated_at")
      .eq("user_id", userId)
      .in("daily_plan_id", planIds)
      .neq("status", "cancelled")
      .limit(2000),
    supabase
      .from("daily_reflections")
      .select("id,daily_plan_id,content,mood,created_at,updated_at")
      .eq("user_id", userId)
      .in("daily_plan_id", planIds)
      .limit(500),
    supabase
      .from("tasks")
      .select("id,title,status,estimate_minutes,created_at,completed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("schedule_change_events")
      .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,created_at")
      .eq("user_id", userId)
      .in("daily_plan_id", planIds)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (blocksResult.error) throw new Error(blocksResult.error.message);
  if (reflectionsResult.error) throw new Error(reflectionsResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);

  const blocks = blocksResult.data ?? [];
  const reflections = reflectionsResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const changes = changesResult.error ? [] : (changesResult.data ?? []);
  const blockIds = blocks.map((block) => block.id);
  const taskIds = tasks.map((task) => task.id);

  const [sessionsResult, taskTagsResult] = await Promise.all([
    blockIds.length
      ? supabase
          .from("work_sessions")
          .select("id,time_block_id,started_at,ended_at,created_at")
          .eq("user_id", userId)
          .in("time_block_id", blockIds)
          .limit(3000)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? supabase
          .from("task_tags")
          .select("task_id,tags(name)")
          .eq("user_id", userId)
          .in("task_id", taskIds)
          .limit(3000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sessionsResult.error) throw new Error(sessionsResult.error.message);
  if (taskTagsResult.error) throw new Error(taskTagsResult.error.message);

  const planDateById = new Map(plans.map((plan) => [plan.id, plan.plan_date]));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const taskTag = new Map<string, string>();
  for (const row of (taskTagsResult.data ?? []) as unknown as Array<{
    task_id: string;
    tags: { name: string } | null;
  }>) {
    if (row.tags && !taskTag.has(row.task_id)) taskTag.set(row.task_id, row.tags.name);
  }

  const sessionsByBlock = new Map<string, number>();
  for (const session of sessionsResult.data ?? []) {
    sessionsByBlock.set(
      session.time_block_id,
      (sessionsByBlock.get(session.time_block_id) ?? 0) + minutesBetween(session.started_at, session.ended_at),
    );
  }

  const dayMap = new Map<string, DailyRecord>();
  for (const plan of plans) {
    dayMap.set(plan.plan_date, {
      date: plan.plan_date,
      plannedMinutes: 0,
      actualMinutes: 0,
      completedBlocks: 0,
      totalBlocks: 0,
      mood: null,
      journal: "",
      changeCount: 0,
    });
  }

  const tagTotals = new Map<string, number>();
  for (const block of blocks) {
    const date = planDateById.get(block.daily_plan_id);
    const day = date ? dayMap.get(date) : undefined;
    if (!day) continue;
    day.plannedMinutes += minutesBetween(block.planned_start, block.planned_end);
    day.actualMinutes += sessionsByBlock.get(block.id) ?? 0;
    day.totalBlocks += 1;
    if (block.status === "completed") day.completedBlocks += 1;
    const tag = block.task_id ? taskTag.get(block.task_id) : undefined;
    if (tag) {
      const key = `${date}\u0000${tag}`;
      tagTotals.set(key, (tagTotals.get(key) ?? 0) + minutesBetween(block.planned_start, block.planned_end));
    }
  }

  for (const reflection of reflections) {
    const date = planDateById.get(reflection.daily_plan_id);
    const day = date ? dayMap.get(date) : undefined;
    if (day) {
      day.mood = reflection.mood;
      day.journal = reflection.content;
    }
  }

  for (const change of changes) {
    const date = planDateById.get(change.daily_plan_id);
    const day = date ? dayMap.get(date) : undefined;
    if (day) day.changeCount += 1;
  }

  if (!changes.length) {
    for (const block of blocks) {
      if (!block.baseline_start || !block.baseline_end) continue;
      if (block.baseline_start === block.planned_start && block.baseline_end === block.planned_end) continue;
      const date = planDateById.get(block.daily_plan_id);
      const day = date ? dayMap.get(date) : undefined;
      if (day) day.changeCount += 1;
    }
  }

  const activities: ActivityRecord[] = [];
  for (const plan of plans) {
    if (!plan.committed_at) continue;
    activities.push({
      id: `plan-${plan.id}`,
      occurredAt: plan.committed_at,
      date: plan.plan_date,
      kind: "plan",
      title: "하루 계획 확정",
      detail: "최초 일정표를 비교 기준으로 저장했어요.",
    });
  }

  for (const task of tasks) {
    activities.push({
      id: `task-created-${task.id}`,
      occurredAt: task.created_at,
      date: localDate(task.created_at),
      kind: "task",
      title: task.title,
      detail: `할 일 추가 · 예상 ${task.estimate_minutes ?? 30}분${taskTag.get(task.id) ? ` · ${taskTag.get(task.id)}` : ""}`,
    });
    if (task.completed_at) {
      activities.push({
        id: `task-completed-${task.id}`,
        occurredAt: task.completed_at,
        date: localDate(task.completed_at),
        kind: "task",
        title: task.title,
        detail: "작업 완료",
      });
    }
  }

  for (const reflection of reflections) {
    const date = planDateById.get(reflection.daily_plan_id) ?? localDate(reflection.updated_at);
    activities.push({
      id: `journal-${reflection.id}`,
      occurredAt: reflection.updated_at,
      date,
      kind: "journal",
      title: `${date} 일기`,
      detail: reflection.content.slice(0, 160),
    });
  }

  const changeLabels: Record<string, string> = {
    created: "타임블록 추가",
    moved: "시간 이동",
    resized: "박스 크기 변경",
    completed: "작업 완료",
    reopened: "완료 취소",
    cancelled: "타임블록 삭제",
  };
  for (const change of changes) {
    const block = change.time_block_id ? blockById.get(change.time_block_id) : undefined;
    const date = planDateById.get(change.daily_plan_id) ?? localDate(change.created_at);
    const before = change.before_state as { title?: string; start?: number; duration?: number } | null;
    const after = change.after_state as { start?: number; duration?: number } | null;
    const details: string[] = [];
    if (before?.start !== undefined && after?.start !== undefined) details.push(`${Math.floor(before.start / 60)}:${String(before.start % 60).padStart(2, "0")} → ${Math.floor(after.start / 60)}:${String(after.start % 60).padStart(2, "0")}`);
    if (before?.duration !== undefined && after?.duration !== undefined && before.duration !== after.duration) details.push(`${before.duration}분 → ${after.duration}분`);
    activities.push({
      id: `change-${change.id}`,
      occurredAt: change.created_at,
      date,
      kind: "schedule",
      title: block?.title ?? before?.title ?? "타임블록",
      detail: `${changeLabels[change.change_type] ?? "일정 변경"}${details.length ? ` · ${details.join(" · ")}` : ""}`,
    });
  }

  if (!changes.length) {
    for (const block of blocks) {
      if (!block.baseline_start || !block.baseline_end) continue;
      if (block.baseline_start === block.planned_start && block.baseline_end === block.planned_end) continue;
      const date = planDateById.get(block.daily_plan_id) ?? localDate(block.updated_at);
      activities.push({
        id: `baseline-${block.id}`,
        occurredAt: block.updated_at,
        date,
        kind: "schedule",
        title: block.title,
        detail: `일정 변경 · ${timeLabel(block.baseline_start)} → ${timeLabel(block.planned_start)}`,
      });
    }
  }

  activities.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return {
    activities,
    days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    tagMinutes: [...tagTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, minutes]) => {
        const [date, tag] = key.split("\u0000");
        return { date, tag, minutes };
      }),
  };
}
