"use client";

import { createClient } from "@/lib/supabase/client";
import { dateInTimeZone } from "@/lib/date";
import type { ChangeReasonKind } from "./types";

export type ActivityKind = "task" | "schedule" | "journal" | "change";

export type ActivityRecord = {
  id: string;
  occurredAt: string;
  date: string;
  kind: ActivityKind;
  title: string;
  detail: string;
};

export type ChangeState = {
  title?: string;
  start?: number;
  duration?: number;
  status?: string;
};

export type ChangeEffect =
  | "created"
  | "cancelled"
  | "moved_later"
  | "moved_earlier"
  | "duration_increased"
  | "duration_decreased";

export type ChangeReviewItem = {
  id: string;
  title: string;
  before: ChangeState | null;
  after: ChangeState | null;
  effects: ChangeEffect[];
  startDelta: number;
  durationDelta: number;
};

export type ChangeReviewGroup = {
  id: string;
  dailyPlanId: string;
  date: string;
  occurredAt: string;
  reason: string | null;
  reasonKind: ChangeReasonKind | null;
  items: ChangeReviewItem[];
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
  changeGroups: ChangeReviewGroup[];
  tagMinutes: Array<{
    tag: string;
    date: string;
    plannedMinutes: number;
    actualMinutes: number;
  }>;
};

const EMPTY_BUNDLE: RecordBundle = { activities: [], days: [], changeGroups: [], tagMinutes: [] };
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

export type ChangeRow = {
  id: string;
  daily_plan_id: string;
  time_block_id: string | null;
  change_type: string;
  before_state: unknown;
  after_state: unknown;
  reason: string | null;
  reason_kind: ChangeReasonKind | null;
  created_at: string;
};

function stateOf(value: unknown): ChangeState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  return {
    ...(typeof state.title === "string" ? { title: state.title } : {}),
    ...(typeof state.start === "number" ? { start: state.start } : {}),
    ...(typeof state.duration === "number" ? { duration: state.duration } : {}),
    ...(typeof state.status === "string" ? { status: state.status } : {}),
  };
}

function changeEffects(before: ChangeState | null, after: ChangeState | null, changeTypes: Set<string>) {
  const effects: ChangeEffect[] = [];
  if (changeTypes.has("created")) effects.push("created");
  if (changeTypes.has("cancelled")) effects.push("cancelled");
  const startDelta = before?.start !== undefined && after?.start !== undefined ? after.start - before.start : 0;
  const durationDelta = before?.duration !== undefined && after?.duration !== undefined ? after.duration - before.duration : 0;
  if (startDelta > 0) effects.push("moved_later");
  if (startDelta < 0) effects.push("moved_earlier");
  if (durationDelta > 0) effects.push("duration_increased");
  if (durationDelta < 0) effects.push("duration_decreased");
  return { effects, startDelta, durationDelta };
}

export function buildChangeGroups(
  changes: ChangeRow[],
  planDateById: Map<string, string>,
  blockTitleById: Map<string, string> = new Map(),
) {
  const rawGroups = new Map<string, {
    id: string;
    dailyPlanId: string;
    date: string;
    occurredAt: string;
    reason: string | null;
    reasonKind: ChangeReasonKind | null;
    changes: ChangeRow[];
  }>();

  for (const change of changes) {
    const reason = change.reason?.trim() || null;
    const reasonKind = change.reason_kind ?? null;
    const date = planDateById.get(change.daily_plan_id) ?? localDate(change.created_at);
    const key = `${change.daily_plan_id}\u0000${change.created_at}\u0000${reasonKind ?? ""}\u0000${reason ?? ""}`;
    const group = rawGroups.get(key) ?? {
      id: change.id,
      dailyPlanId: change.daily_plan_id,
      date,
      occurredAt: change.created_at,
      reason,
      reasonKind,
      changes: [],
    };
    group.changes.push(change);
    rawGroups.set(key, group);
  }

  return [...rawGroups.values()].map<ChangeReviewGroup>((group) => {
    const byBlock = new Map<string, {
      id: string;
      before: ChangeState | null;
      after: ChangeState | null;
      changeTypes: Set<string>;
    }>();
    for (const change of group.changes) {
      const blockKey = change.time_block_id ?? change.id;
      const item = byBlock.get(blockKey) ?? {
        id: blockKey,
        before: null,
        after: null,
        changeTypes: new Set<string>(),
      };
      item.before ??= stateOf(change.before_state);
      const nextAfter = stateOf(change.after_state);
      if (nextAfter && (nextAfter.start !== undefined || nextAfter.duration !== undefined || !item.after)) item.after = nextAfter;
      item.changeTypes.add(change.change_type);
      byBlock.set(blockKey, item);
    }

    const items = [...byBlock.values()].map<ChangeReviewItem>((item) => {
      const { effects, startDelta, durationDelta } = changeEffects(item.before, item.after, item.changeTypes);
      return {
        id: item.id,
        title: blockTitleById.get(item.id) ?? item.before?.title ?? item.after?.title ?? "타임블록",
        before: item.before,
        after: item.after,
        effects,
        startDelta,
        durationDelta,
      };
    }).sort((a, b) => (a.before?.start ?? a.after?.start ?? 0) - (b.before?.start ?? b.after?.start ?? 0));

    return {
      id: group.id,
      dailyPlanId: group.dailyPlanId,
      date: group.date,
      occurredAt: group.occurredAt,
      reason: group.reason,
      reasonKind: group.reasonKind,
      items,
    };
  }).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

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

function timeInZoneLabel(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export async function loadPlanChangeGroups(
  userId: string,
  dailyPlanId: string,
  planDate: string,
): Promise<ChangeReviewGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("schedule_change_events")
    .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,reason,reason_kind,created_at")
    .eq("user_id", userId)
    .eq("daily_plan_id", dailyPlanId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return buildChangeGroups(data as ChangeRow[] ?? [], new Map([[dailyPlanId, planDate]]));
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
        .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,reason,reason_kind,created_at")
        .eq("user_id", userId)
        .in("daily_plan_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("schedule_change_events.reason") && !message.includes("reason does not exist") && !message.includes("reason_kind")) throw error;
      const legacyRows = await fetchAllBatches<Omit<ChangeRow, "reason" | "reason_kind">>(committedPlanIds, async (ids, from, to) => queryPage<Omit<ChangeRow, "reason" | "reason_kind">>(await supabase
        .from("schedule_change_events")
        .select("id,daily_plan_id,time_block_id,change_type,before_state,after_state,created_at")
        .eq("user_id", userId)
        .in("daily_plan_id", ids)
        .order("created_at", { ascending: false })
        .range(from, to)));
      return legacyRows.map((row) => ({ ...row, reason: null, reason_kind: null }));
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

  const changeGroups = buildChangeGroups(
    changes,
    planDateById,
    new Map([...blockById].map(([id, block]) => [id, block.title])),
  );
  for (const group of changeGroups) {
    const day = dayMap.get(group.date);
    if (day) day.changeCount += group.items.length;
    const summary = group.items.map((item) => {
      const labels = item.effects.map((effect) => effect === "created" ? "추가" : effect === "cancelled" ? "삭제" : effect === "moved_later" ? `${item.startDelta}분 늦어짐` : effect === "moved_earlier" ? `${Math.abs(item.startDelta)}분 당김` : effect === "duration_increased" ? `${item.durationDelta}분 늘림` : `${Math.abs(item.durationDelta)}분 줄임`);
      return `${item.title} · ${labels.join(" · ")}`;
    });
    activities.push({
      id: `change-group-${group.id}`,
      occurredAt: group.occurredAt,
      date: group.date,
      kind: "change",
      title: `계획에서 달라진 일정 ${group.items.length}개`,
      detail: `${group.reason ? `변경 이유 · ${group.reason}` : "변경 이유가 기록되지 않았어요."}\n${summary.map((line) => `• ${line}`).join("\n")}`,
    });
  }

  activities.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return {
    activities,
    days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    changeGroups,
    tagMinutes: [...tagTotals.entries()]
      .sort((a, b) => b[1].actualMinutes - a[1].actualMinutes || b[1].plannedMinutes - a[1].plannedMinutes)
      .map(([key, minutes]) => {
        const [date, tag] = key.split("\u0000");
        return { date, tag, ...minutes };
      }),
  };
}
