import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PlannerSeed } from "./store";
import type { TagName, Task, TimeBlock } from "./types";

type TaskRow = {
  id: string;
  title: string;
  estimate_minutes: number | null;
  energy_required: number | null;
  status: string;
};

type BlockRow = {
  id: string;
  task_id: string | null;
  title: string;
  planned_start: string;
  planned_end: string;
  kind: TimeBlock["type"];
  status: string;
};

type SessionRow = {
  time_block_id: string;
  started_at: string;
  ended_at: string | null;
};

const tagColors: Record<string, Task["color"]> = {
  자소서: "coral",
  면접: "violet",
  일상: "blue",
  메시지: "amber",
  성장: "green",
  업무: "blue",
};

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minutesInZone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function energyLabel(value: number | null): Task["energy"] {
  if ((value ?? 3) <= 2) return "낮음";
  if ((value ?? 3) >= 4) return "높음";
  return "보통";
}

function blockStatus(value: string): TimeBlock["status"] {
  if (value === "in_progress") return "running";
  if (value === "completed") return "completed";
  return "scheduled";
}

function blockColor(kind: TimeBlock["type"], task?: Task) {
  if (task) return task.color;
  if (kind === "buffer") return "green" as const;
  if (kind === "appointment") return "blue" as const;
  return "slate" as const;
}

export async function getPlannerSeed(): Promise<PlannerSeed | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return null;

  const userId = claimsData.claims.sub;
  const timezone = "Asia/Seoul";
  const planDate = localDate(timezone);

  let { data: plan, error: planError } = await supabase
    .from("daily_plans")
    .select("id, timezone")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan) {
    const result = await supabase
      .from("daily_plans")
      .insert({ user_id: userId, plan_date: planDate, timezone, status: "draft" })
      .select("id, timezone")
      .single();
    if (result.error) throw new Error(result.error.message);
    plan = result.data;
  }

  const [tasksResult, prioritiesResult, blocksResult, sessionsResult, reflectionResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,estimate_minutes,energy_required,status")
        .eq("user_id", userId)
        .eq("status", "inbox")
        .order("created_at", { ascending: false }),
      supabase
        .from("daily_priorities")
        .select("task_id,rank")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .order("rank"),
      supabase
        .from("time_blocks")
        .select("id,task_id,title,planned_start,planned_end,kind,status")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .neq("status", "cancelled")
        .order("planned_start"),
      supabase
        .from("work_sessions")
        .select("time_block_id,started_at,ended_at")
        .eq("user_id", userId),
      supabase
        .from("daily_reflections")
        .select("content,mood")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .maybeSingle(),
    ]);

  for (const result of [tasksResult, prioritiesResult, blocksResult, sessionsResult, reflectionResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const taskRows = (tasksResult.data ?? []) as TaskRow[];
  const taskIds = taskRows.map((task) => task.id);
  const taskTagsResult = taskIds.length
    ? await supabase
        .from("task_tags")
        .select("task_id,tags(name,color)")
        .eq("user_id", userId)
        .in("task_id", taskIds)
    : { data: [], error: null };
  if (taskTagsResult.error) throw new Error(taskTagsResult.error.message);

  const tagByTask = new Map<string, { name: string; color: string }>();
  const tagRows = (taskTagsResult.data ?? []) as unknown as Array<{
    task_id: string;
    tags: { name: string; color: string } | null;
  }>;
  for (const row of tagRows) if (row.tags) tagByTask.set(row.task_id, row.tags);

  const priorityIds = new Set((prioritiesResult.data ?? []).map((row) => row.task_id));
  const tasks: Task[] = taskRows.map((row) => {
    const tag = tagByTask.get(row.id);
    const tagName = (tag?.name ?? "미분류") as TagName;
    return {
      id: row.id,
      title: row.title,
      estimate: row.estimate_minutes ?? 30,
      tag: tagName,
      color: tagColors[tagName] ?? "slate",
      energy: energyLabel(row.energy_required),
      isMit: priorityIds.has(row.id),
      completed: false,
    };
  });

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const actualByBlock = new Map<string, number>();
  for (const session of (sessionsResult.data ?? []) as SessionRow[]) {
    if (!session.ended_at) continue;
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60_000,
      ),
    );
    actualByBlock.set(session.time_block_id, (actualByBlock.get(session.time_block_id) ?? 0) + minutes);
  }

  const blocks: TimeBlock[] = ((blocksResult.data ?? []) as BlockRow[]).map((row) => {
    const task = row.task_id ? tasksById.get(row.task_id) : undefined;
    return {
      id: row.id,
      taskId: row.task_id ?? undefined,
      title: row.title,
      start: minutesInZone(row.planned_start, plan.timezone),
      duration: Math.max(
        15,
        Math.round(
          (new Date(row.planned_end).getTime() - new Date(row.planned_start).getTime()) / 60_000,
        ),
      ),
      actualMinutes: actualByBlock.get(row.id),
      type: row.kind,
      color: blockColor(row.kind, task),
      status: blockStatus(row.status),
    };
  });

  return {
    userId,
    dailyPlanId: plan.id,
    planDate,
    timezone: plan.timezone,
    tasks,
    blocks,
    selectedBlockId: blocks[0]?.id ?? null,
    journal: reflectionResult.data?.content ?? "",
    mood: reflectionResult.data?.mood ?? 3,
  };
}
