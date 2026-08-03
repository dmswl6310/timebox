"use client";

import { createClient } from "@/lib/supabase/client";
import type { Task, TimeBlock } from "./types";

type PersistenceContext = {
  userId: string;
  dailyPlanId: string;
  planDate: string;
  timezone: string;
};

type ScheduleChange = {
  blockId: string;
  type: "created" | "moved" | "resized" | "completed" | "reopened" | "cancelled";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

function toIso(planDate: string, minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return new Date(`${planDate}T${hours}:${mins}:00+09:00`).toISOString();
}

function dbStatus(status: TimeBlock["status"]) {
  if (status === "running") return "in_progress";
  return status;
}

function assertSuccess(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function replaceTaskTag(
  context: PersistenceContext,
  task: Task,
) {
  const supabase = createClient();
  const { data: existingTag, error: readError } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", context.userId)
    .ilike("name", task.tag)
    .limit(1)
    .maybeSingle();
  assertSuccess(readError);

  let tagId = existingTag?.id as string | undefined;
  if (!tagId) {
    const { data: createdTag, error: createError } = await supabase
      .from("tags")
      .insert({ user_id: context.userId, name: task.tag, color: task.color })
      .select("id")
      .single();
    assertSuccess(createError);
    if (!createdTag) throw new Error("태그를 만들지 못했습니다.");
    tagId = createdTag.id;
  }

  const { error: deleteError } = await supabase
    .from("task_tags")
    .delete()
    .eq("user_id", context.userId)
    .eq("task_id", task.id);
  assertSuccess(deleteError);

  const { error: tagError } = await supabase.from("task_tags").insert({
    user_id: context.userId,
    task_id: task.id,
    tag_id: tagId,
  });
  assertSuccess(tagError);
}

export async function persistTaskCreate(context: PersistenceContext, task: Task) {
  const supabase = createClient();
  const { error } = await supabase.from("tasks").insert({
    id: task.id,
    user_id: context.userId,
    title: task.title,
    estimate_minutes: task.estimate,
    energy_required: 3,
    preferred_period: "any",
    status: "inbox",
  });
  assertSuccess(error);
  await replaceTaskTag(context, task);
}

export async function persistTaskUpdate(context: PersistenceContext, task: Task) {
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ title: task.title, estimate_minutes: task.estimate })
    .eq("id", task.id)
    .eq("user_id", context.userId);
  assertSuccess(error);

  const { error: blockError } = await supabase
    .from("time_blocks")
    .update({ title: task.title })
    .eq("task_id", task.id)
    .eq("user_id", context.userId)
    .neq("status", "cancelled");
  assertSuccess(blockError);
  await replaceTaskTag(context, task);
}

export async function persistTaskDiscard(context: PersistenceContext, taskId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "discarded" })
    .eq("id", taskId)
    .eq("user_id", context.userId);
  assertSuccess(error);
}

export async function persistPriorities(context: PersistenceContext, taskIds: string[]) {
  const supabase = createClient();
  const { error: deleteError } = await supabase
    .from("daily_priorities")
    .delete()
    .eq("daily_plan_id", context.dailyPlanId)
    .eq("user_id", context.userId);
  assertSuccess(deleteError);

  if (!taskIds.length) return;
  const { error } = await supabase.from("daily_priorities").insert(
    taskIds.slice(0, 3).map((taskId, index) => ({
      user_id: context.userId,
      daily_plan_id: context.dailyPlanId,
      task_id: taskId,
      rank: index + 1,
    })),
  );
  assertSuccess(error);
}

export async function persistBlockCreate(context: PersistenceContext, block: TimeBlock) {
  const supabase = createClient();
  const { error } = await supabase.from("time_blocks").insert({
    id: block.id,
    user_id: context.userId,
    daily_plan_id: context.dailyPlanId,
    task_id: block.taskId ?? null,
    kind: block.type,
    title: block.title,
    planned_start: toIso(context.planDate, block.start),
    planned_end: toIso(context.planDate, block.start + block.duration),
    status: dbStatus(block.status),
  });
  assertSuccess(error);
}

export async function persistBlockMove(
  context: PersistenceContext,
  blockId: string,
  start: number,
  duration: number,
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("time_blocks")
    .update({
      planned_start: toIso(context.planDate, start),
      planned_end: toIso(context.planDate, start + duration),
    })
    .eq("id", blockId)
    .eq("user_id", context.userId);
  assertSuccess(error);
}

export async function persistBlockCompletion(
  context: PersistenceContext,
  block: TimeBlock,
  completed: boolean,
) {
  const supabase = createClient();
  const { error: blockError } = await supabase
    .from("time_blocks")
    .update({ status: completed ? "completed" : "scheduled" })
    .eq("id", block.id)
    .eq("user_id", context.userId);
  assertSuccess(blockError);

  if (!block.taskId) return;
  const { error: taskError } = await supabase
    .from("tasks")
    .update({
      status: completed ? "completed" : "inbox",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", block.taskId)
    .eq("user_id", context.userId);
  assertSuccess(taskError);
}

export async function persistActualMinutes(
  context: PersistenceContext,
  block: TimeBlock,
  minutes: number,
) {
  const supabase = createClient();
  const { data: existing, error: readError } = await supabase
    .from("work_sessions")
    .select("id")
    .eq("time_block_id", block.id)
    .eq("user_id", context.userId)
    .eq("source", "manual")
    .limit(1)
    .maybeSingle();
  assertSuccess(readError);

  const startedAt = toIso(context.planDate, block.start);
  const endedAt = new Date(new Date(startedAt).getTime() + minutes * 60_000).toISOString();

  if (existing?.id) {
    const { error } = await supabase
      .from("work_sessions")
      .update({ started_at: startedAt, ended_at: endedAt })
      .eq("id", existing.id)
      .eq("user_id", context.userId);
    assertSuccess(error);
    return;
  }

  const { error } = await supabase.from("work_sessions").insert({
    user_id: context.userId,
    time_block_id: block.id,
    started_at: startedAt,
    ended_at: endedAt,
    source: "manual",
  });
  assertSuccess(error);
}

export async function persistReflection(
  context: PersistenceContext,
  content: string,
  mood: number,
) {
  const supabase = createClient();
  const { error } = await supabase.from("daily_reflections").upsert(
    {
      user_id: context.userId,
      daily_plan_id: context.dailyPlanId,
      content,
      mood,
    },
    { onConflict: "daily_plan_id" },
  );
  assertSuccess(error);
}

export async function persistPlanCommit(
  context: PersistenceContext,
  blocks: TimeBlock[],
) {
  const supabase = createClient();
  const committedAt = new Date().toISOString();
  const { error: planError } = await supabase
    .from("daily_plans")
    .update({ status: "committed", committed_at: committedAt })
    .eq("id", context.dailyPlanId)
    .eq("user_id", context.userId);
  assertSuccess(planError);

  await Promise.all(blocks.map(async (block) => {
    const { error } = await supabase
      .from("time_blocks")
      .update({
        baseline_start: toIso(context.planDate, block.start),
        baseline_end: toIso(context.planDate, block.start + block.duration),
      })
      .eq("id", block.id)
      .eq("user_id", context.userId);
    assertSuccess(error);
  }));
}

export async function persistScheduleChange(
  context: PersistenceContext,
  change: ScheduleChange,
) {
  const supabase = createClient();
  const { error } = await supabase.from("schedule_change_events").insert({
    user_id: context.userId,
    daily_plan_id: context.dailyPlanId,
    time_block_id: change.blockId,
    change_type: change.type,
    before_state: change.before ?? null,
    after_state: change.after ?? null,
  });

  // 배포 전에 마이그레이션이 아직 적용되지 않은 짧은 구간에는 핵심 저장을 막지 않는다.
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error(error.message);
  }
}
