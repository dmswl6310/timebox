import "server-only";

import { createClient } from "@/lib/supabase/server";
import { dateInTimeZone } from "@/lib/date";
import type { PlannerSeed } from "./store";
import { normalizeTagName, savedTagColor } from "./tag-utils";
import type { Task, TimeBlock } from "./types";

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
  baseline_start: string | null;
  baseline_end: string | null;
  kind: TimeBlock["type"];
  status: string;
};

type SessionRow = {
  time_block_id: string;
  started_at: string;
  ended_at: string | null;
};

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

export async function getPlannerSeed(requestedPlanDate?: string): Promise<PlannerSeed | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return null;

  const userId = claimsData.claims.sub;
  const timezone = "Asia/Seoul";
  const planDate = requestedPlanDate ?? dateInTimeZone(timezone);

  const planResult = await supabase
    .from("daily_plans")
    .select("id, timezone, status")
    .eq("user_id", userId)
    .eq("plan_date", planDate)
    .maybeSingle();
  let plan = planResult.data;
  const planError = planResult.error;

  if (planError) throw new Error(planError.message);
  if (!plan) {
    const result = await supabase
      .from("daily_plans")
      .upsert(
        { user_id: userId, plan_date: planDate, timezone, status: "draft" },
        { onConflict: "user_id,plan_date" },
      )
      .select("id, timezone, status")
      .single();
    if (result.error) throw new Error(result.error.message);
    plan = result.data;
  }

  const [prioritiesResult, blocksResult, reflectionResult, blockReasonsResult] =
    await Promise.all([
      supabase
        .from("daily_priorities")
        .select("task_id,rank")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .order("rank"),
      supabase
        .from("time_blocks")
        .select("id,task_id,title,planned_start,planned_end,baseline_start,baseline_end,kind,status")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .neq("status", "cancelled")
        .order("planned_start"),
      supabase
        .from("daily_reflections")
        .select("content,mood")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id)
        .maybeSingle(),
      supabase
        .from("time_blocks")
        .select("id,change_reasons")
        .eq("user_id", userId)
        .eq("daily_plan_id", plan.id),
    ]);

  for (const result of [prioritiesResult, blocksResult, reflectionResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const blockIds = (blocksResult.data ?? []).map((block) => block.id);
  const blockTaskIds = [...new Set((blocksResult.data ?? []).flatMap((block) => block.task_id ? [block.task_id] : []))];
  let tasksQuery = supabase
    .from("tasks")
    .select("id,title,estimate_minutes,energy_required,status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  tasksQuery = blockTaskIds.length
    ? tasksQuery.or(`status.eq.inbox,id.in.(${blockTaskIds.join(",")})`)
    : tasksQuery.eq("status", "inbox");

  const [tasksResult, sessionsResult] = await Promise.all([
    tasksQuery,
    blockIds.length
      ? supabase
          .from("work_sessions")
          .select("time_block_id,started_at,ended_at")
          .eq("user_id", userId)
          .in("time_block_id", blockIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (sessionsResult.error) throw new Error(sessionsResult.error.message);

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
    const tagName = normalizeTagName(tag?.name ?? "미분류");
    return {
      id: row.id,
      title: row.title,
      estimate: row.estimate_minutes ?? 30,
      tag: tagName,
      color: savedTagColor(tag?.color, tagName),
      energy: energyLabel(row.energy_required),
      isMit: priorityIds.has(row.id),
      completed: row.status === "completed",
    };
  });

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const changeReasonsByBlock = new Map(
    ((blockReasonsResult.data ?? []) as Array<{ id: string; change_reasons: TimeBlock["changeReasons"] | null }>)
      .map((row) => [row.id, row.change_reasons ?? undefined] as const),
  );
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
      baselineStart: row.baseline_start
        ? minutesInZone(row.baseline_start, plan.timezone)
        : undefined,
      baselineDuration: row.baseline_start && row.baseline_end
        ? Math.max(
            15,
            Math.round(
              (new Date(row.baseline_end).getTime() - new Date(row.baseline_start).getTime()) / 60_000,
            ),
          )
        : undefined,
      changeReasons: changeReasonsByBlock.get(row.id),
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
    planStatus: plan.status as PlannerSeed["planStatus"],
  };
}
