"use client";

import { createClient } from "@/lib/supabase/client";
import { dateInTimeZone } from "@/lib/date";

export type ActivityKind = "task" | "schedule" | "journal" | "change";

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
  tagMinutes: Array<{
    tag: string;
    date: string;
    plannedMinutes: number;
    actualMinutes: number;
  }>;
};

const EMPTY_BUNDLE: RecordBundle = { activities: [], days: [], tagMinutes: [] };
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

type QueryError = { message: string } | null;
type QueryPage<T> = { data: T[] | null; error: QueryError };

type PlanRow = {
  id: string;
  plan_date: string;
  status: string;
  timezone: string;
};

type BlockRow = {
  id: string;
  daily_plan_id: string;
  task_id: string | null;
  title: string;
  planned_start: string;
  planned_end: string;
  status: string;
};

type ReflectionRow = {
  daily_plan_id: string;
  content: string;
  mood: number | null;
  updated_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  estimate_minutes: number | null;
  created_at: string;
  completed_at: string | null;
};

type ChangeRow = {
  id: string;
  daily_plan_id: string;
  time_block_id: string | null;
  change_type: string;
  before_state: unknown;
  after_state: unknown;
  reason: string | null;
  created_at: string;
};

type SessionRow = {
  time_block_id: string;
  started_at: string;
  ended_at: string | null;
};

type TaskTagRow = { task_id: string; tags: { name: string } | null };

function queryPage<T>(result: { data: unknown; error: QueryError }): QueryPage<T> {
  return { data: Array.isArray(result.data) ? result.data as T[] : null, error: result.error };
}

async function fetchAllPages<T>(loadPage: (from: number, to: number) => Promise<QueryPage<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await loadPage(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function batches<T>(items: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += ID_BATCH_SIZE) {
    result.push(items.slice(index, index + ID_BATCH_SIZE));
  }
  return result;
}

async function fetchAllBatches<T>(
  ids: string[],
  loadPage: (ids: string[], from: number, to: number) => Promise<QueryPage<T>>,
) {
  const rows: T[] = [];
  for (const idBatch of batches(ids)) {
    rows.push(...await fetchAllPages((from, to) => loadPage(idBatch, from, to)));
  }
  return rows;
}

function minutesBetween(start: string, end: string | null) {
  if (!end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

function localDate(iso: string) {
  return dateInTimeZone("Asia/Seoul", new Date(iso));
}

function minuteOfDayLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeInZoneLabel(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function loadRecordBundle(userId: string): Promise<RecordBundle> {
  const supabase = createClient();
  const plans = await fetchAllPages<PlanRow>(async (from, to) => queryPage<PlanRow>(
    await supabase
      .from("daily_plans")
      .select("id,plan_date,status,timezone")
      .eq("user_id", userId)
      .order("plan_date", { ascending: false })
      .range(from, to),
  ));
  if (!plans.length) return EMPTY_BUNDLE;

  const planIds = plans.map((plan) => plan.id);
  const committedPlanIds = plans.filter((plan) => plan.status !== "draft").map((plan) => plan.id);
  const loadChanges = async () => {
    if (!committedPlanIds.length) return [] as ChangeRow[];
    try {
      return await fetchAllBatches<ChangeRow>(committedPlanIds, async (ids, from, to) => queryPage<ChangeRow>(await supabase
        .from("schedule_change_events")
        .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,reason,created_at")
        .eq("user_id", userId)
        .in("daily_plan_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("schedule_change_events.reason") && !message.includes("reason does not exist")) throw error;
      const legacyRows = await fetchAllBatches<Omit<ChangeRow, "reason">>(committedPlanIds, async (ids, from, to) => queryPage<Omit<ChangeRow, "reason">>(await supabase
        .from("schedule_change_events")
        .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,created_at")
        .eq("user_id", userId)
        .in("daily_plan_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to)));
      return legacyRows.map((row) => ({ ...row, reason: null }));
    }
  };
  const [blocks, reflections, tasks, changes] = await Promise.all([
    fetchAllBatches<BlockRow>(planIds, async (ids, from, to) => queryPage<BlockRow>(await supabase
      .from("time_blocks")
      .select("id,daily_plan_id,task_id,title,planned_start,planned_end,status")
      .eq("user_id", userId)
      .in("daily_plan_id", ids)
      .neq("status", "cancelled")
      .range(from, to))),
    fetchAllBatches<ReflectionRow>(planIds, async (ids, from, to) => queryPage<ReflectionRow>(await supabase
      .from("daily_reflections")
      .select("daily_plan_id,content,mood,updated_at")
      .eq("user_id", userId)
      .in("daily_plan_id", ids)
      .range(from, to))),
    fetchAllPages<TaskRow>(async (from, to) => queryPage<TaskRow>(await supabase
      .from("tasks")
      .select("id,title,estimate_minutes,created_at,completed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to))),
    loadChanges(),
  ]);
  const blockIds = blocks.map((block) => block.id);
  const taskIds = tasks.map((task) => task.id);

  const [sessions, taskTags] = await Promise.all([
    blockIds.length
      ? fetchAllBatches<SessionRow>(blockIds, async (ids, from, to) => queryPage<SessionRow>(await supabase
          .from("work_sessions")
          .select("time_block_id,started_at,ended_at")
          .eq("user_id", userId)
          .in("time_block_id", ids)
          .range(from, to)))
      : Promise.resolve([] as SessionRow[]),
    taskIds.length
      ? fetchAllBatches<TaskTagRow>(taskIds, async (ids, from, to) => queryPage<TaskTagRow>(await supabase
          .from("task_tags")
          .select("task_id,tags(name)")
          .eq("user_id", userId)
          .in("task_id", ids)
          .range(from, to)))
      : Promise.resolve([] as TaskTagRow[]),
  ]);

  const planDateById = new Map(plans.map((plan) => [plan.id, plan.plan_date]));
  const planTimezoneById = new Map(plans.map((plan) => [plan.id, plan.timezone]));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const taskTag = new Map<string, string>();
  for (const row of taskTags) {
    if (row.tags && !taskTag.has(row.task_id)) taskTag.set(row.task_id, row.tags.name);
  }

  const sessionsByBlock = new Map<string, number>();
  for (const session of sessions) {
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

  const tagTotals = new Map<string, { plannedMinutes: number; actualMinutes: number }>();
  for (const block of blocks) {
    const date = planDateById.get(block.daily_plan_id);
    const day = date ? dayMap.get(date) : undefined;
    if (!day) continue;
    const plannedMinutes = minutesBetween(block.planned_start, block.planned_end);
    const actualMinutes = sessionsByBlock.get(block.id) ?? 0;
    day.plannedMinutes += plannedMinutes;
    day.actualMinutes += actualMinutes;
    day.totalBlocks += 1;
    if (block.status === "completed") day.completedBlocks += 1;
    const tag = block.task_id ? taskTag.get(block.task_id) : undefined;
    if (tag) {
      const key = `${date}\u0000${tag}`;
      const current = tagTotals.get(key) ?? { plannedMinutes: 0, actualMinutes: 0 };
      tagTotals.set(key, {
        plannedMinutes: current.plannedMinutes + plannedMinutes,
        actualMinutes: current.actualMinutes + actualMinutes,
      });
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

  const activities: ActivityRecord[] = [];
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

  for (const block of blocks) {
    const date = planDateById.get(block.daily_plan_id);
    if (!date) continue;
    const timezone = planTimezoneById.get(block.daily_plan_id) ?? "Asia/Seoul";
    const plannedMinutes = minutesBetween(block.planned_start, block.planned_end);
    const actualMinutes = sessionsByBlock.get(block.id) ?? 0;
    const details = [
      `${timeInZoneLabel(block.planned_start, timezone)}–${timeInZoneLabel(block.planned_end, timezone)}`,
      `계획 ${plannedMinutes}분`,
    ];
    if (actualMinutes > 0) details.push(`실제 ${actualMinutes}분`);
    if (block.status === "completed") details.push("완료");
    activities.push({
      id: `block-${block.id}`,
      occurredAt: block.planned_start,
      date,
      kind: "schedule",
      title: block.title,
      detail: details.join(" · "),
    });
  }

  for (const reflection of reflections) {
    const date = planDateById.get(reflection.daily_plan_id) ?? localDate(reflection.updated_at);
    activities.push({
      id: `journal-${reflection.daily_plan_id}`,
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
  const groupedChanges = new Map<string, { id: string; date: string; occurredAt: string; reason: string | null; lines: string[] }>();
  for (const change of changes) {
    const block = change.time_block_id ? blockById.get(change.time_block_id) : undefined;
    const date = planDateById.get(change.daily_plan_id) ?? localDate(change.created_at);
    const before = change.before_state as { title?: string; start?: number; duration?: number } | null;
    const after = change.after_state as { title?: string; start?: number; duration?: number } | null;
    const details: string[] = [];
    if (before?.start !== undefined && after?.start !== undefined) details.push(`${minuteOfDayLabel(before.start)} → ${minuteOfDayLabel(after.start)}`);
    if (before?.duration !== undefined && after?.duration !== undefined && before.duration !== after.duration) details.push(`${before.duration}분 → ${after.duration}분`);
    if (change.change_type === "created" && after?.start !== undefined) details.push(`${minuteOfDayLabel(after.start)} · ${after.duration ?? 0}분`);
    if (change.change_type === "cancelled" && before?.start !== undefined) details.push(`${minuteOfDayLabel(before.start)} · ${before.duration ?? 0}분`);
    const reason = change.reason?.trim() || null;
    const key = `${change.daily_plan_id}\u0000${change.created_at}\u0000${reason ?? ""}`;
    const group = groupedChanges.get(key) ?? { id: change.id, date, occurredAt: change.created_at, reason, lines: [] };
    group.lines.push(`${block?.title ?? before?.title ?? after?.title ?? "타임블록"} · ${changeLabels[change.change_type] ?? "일정 변경"}${details.length ? ` · ${details.join(" · ")}` : ""}`);
    groupedChanges.set(key, group);
  }
  for (const group of groupedChanges.values()) {
    activities.push({
      id: `change-group-${group.id}`,
      occurredAt: group.occurredAt,
      date: group.date,
      kind: "change",
      title: `계획에서 달라진 내용 ${group.lines.length}개`,
      detail: `${group.reason ? `변경 이유 · ${group.reason}` : "변경 이유가 기록되지 않았어요."}\n${group.lines.map((line) => `• ${line}`).join("\n")}`,
    });
  }

  activities.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return {
    activities,
    days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    tagMinutes: [...tagTotals.entries()]
      .sort((a, b) => b[1].actualMinutes - a[1].actualMinutes || b[1].plannedMinutes - a[1].plannedMinutes)
      .map(([key, minutes]) => {
        const [date, tag] = key.split("\u0000");
        return { date, tag, ...minutes };
      }),
  };
}
