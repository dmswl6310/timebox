"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { dateInTimeZone } from "@/lib/date";
import {
  persistActualMinutes,
  persistBlockCancel,
  persistBlockCompletion,
  persistBlockCreate,
  persistBlockMove,
  persistDayStartHour,
  persistPlanClose,
  persistPlanCommit,
  persistPriorities,
  persistReflection,
  persistTaskCreate,
  persistTaskDiscard,
  persistTaskEstimate,
  persistTagCreate,
  persistTaskUpdate,
} from "./persistence";
import { colorForTag, normalizeTagName, tagSuggestions } from "./tag-utils";
import { PLAN_END_MINUTES } from "./planner-time";
import type { MobileView, PlanStatus, TagName, Task, TimeBlock } from "./types";

export type PlannerSeed = {
  userId: string | null;
  userEmail: string | null;
  dailyPlanId: string | null;
  planDate: string;
  timezone: string;
  dayStartHour: number;
  tasks: Task[];
  availableTags: string[];
  blocks: TimeBlock[];
  selectedBlockId: string | null;
  journal: string;
  mood: number;
  planStatus: PlanStatus;
};

const demoTasks: Task[] = [
  { id: "task-portfolio", title: "포트폴리오 핵심 문장 다듬기", estimate: 60, tag: "자소서", color: "coral", energy: "높음", isMit: true, completed: false },
  { id: "task-interview", title: "모의 면접 답변 녹음하기", estimate: 30, tag: "면접", color: "violet", energy: "높음", isMit: true, completed: false },
  { id: "task-budget", title: "이번 주 생활비 정리하기", estimate: 30, tag: "일상", color: "blue", energy: "낮음", isMit: true, completed: false },
  { id: "task-reply", title: "민지에게 회의 일정 답장하기", estimate: 15, tag: "메시지", color: "amber", energy: "낮음", isMit: false, completed: false },
  { id: "task-reading", title: "타임박싱 책 20쪽 읽기", estimate: 30, tag: "성장", color: "green", energy: "보통", isMit: false, completed: false },
  { id: "task-laundry", title: "세탁기 돌리고 빨래 널기", estimate: 30, tag: "일상", color: "blue", energy: "낮음", isMit: false, completed: false },
];

const demoBlocks: TimeBlock[] = [
  { id: "block-plan", title: "오늘 계획 세우기", start: 8 * 60 + 30, duration: 15, actualMinutes: 15, type: "planning", color: "slate", status: "completed" },
  { id: "block-portfolio", taskId: "task-portfolio", title: "포트폴리오 핵심 문장 다듬기", start: 9 * 60, duration: 60, actualMinutes: 52, type: "task", color: "coral", status: "completed" },
  { id: "block-buffer-1", title: "숨 고르기", start: 10 * 60, duration: 15, type: "buffer", color: "green", status: "scheduled" },
  { id: "block-meeting", title: "팀 주간 싱크", start: 10 * 60 + 30, duration: 30, type: "appointment", color: "blue", status: "scheduled" },
  { id: "block-interview", taskId: "task-interview", title: "모의 면접 답변 녹음하기", start: 13 * 60, duration: 30, type: "task", color: "violet", status: "running" },
  { id: "block-lunch", title: "점심 · 산책", start: 13 * 60 + 45, duration: 60, type: "buffer", color: "green", status: "scheduled" },
  { id: "block-budget", taskId: "task-budget", title: "이번 주 생활비 정리하기", start: 16 * 60, duration: 30, type: "task", color: "blue", status: "scheduled" },
];

export const demoSeed: PlannerSeed = {
  userId: null,
  userEmail: null,
  dailyPlanId: null,
  planDate: dateInTimeZone(),
  timezone: "Asia/Seoul",
  dayStartHour: 7,
  tasks: demoTasks,
  availableTags: tagSuggestions(demoTasks.map((task) => task.tag)),
  blocks: demoBlocks,
  selectedBlockId: "block-interview",
  journal: "오전에는 생각보다 집중이 잘 됐다. 면접 답변은 완벽하게 하려기보다 먼저 끝까지 말해보는 데 집중하자.",
  mood: 4,
  planStatus: "draft",
};

export type PlannerState = PlannerSeed & {
  mobileView: MobileView;
  notice: string | null;
  addTag: (name: string) => void;
  setDayStartHour: (hour: number) => void;
  addTask: (title: string, tag: TagName, estimate: number) => void;
  updateTask: (taskId: string, patch: Pick<Task, "title" | "tag" | "estimate">, reason?: string) => boolean;
  toggleMit: (taskId: string) => void;
  scheduleTask: (taskId: string, start?: number, reason?: string) => void;
  moveBlock: (blockId: string, start: number, reason?: string) => void;
  previewResizeBlock: (blockId: string, duration: number) => void;
  resizeBlock: (blockId: string, duration: number, originalDuration?: number, reason?: string) => void;
  removeBlock: (blockId: string, reason?: string) => void;
  selectBlock: (blockId: string) => void;
  toggleBlockComplete: (blockId: string) => void;
  updateActualMinutes: (blockId: string, minutes: number) => void;
  addBufferAfter: (blockId: string, reason?: string) => void;
  discardTask: (taskId: string, reason?: string) => void;
  setMobileView: (view: MobileView) => void;
  setJournal: (value: string) => void;
  setMood: (value: number) => void;
  saveJournal: (silent?: boolean) => void;
  confirmPlan: () => void;
  closePlan: () => void;
  setNotice: (value: string | null) => void;
};

function overlaps(blocks: TimeBlock[], start: number, duration: number, ignoredBlockId?: string) {
  return blocks.some((block) => block.id !== ignoredBlockId && start < block.start + block.duration && start + duration > block.start);
}

function validDayStartHour(hour: number) {
  return Math.max(5, Math.min(12, Math.round(hour)));
}

function nextAvailableStart(blocks: TimeBlock[], duration: number, dayStartHour: number) {
  const dayStart = validDayStartHour(dayStartHour) * 60;
  let cursor = dayStart;
  while (cursor + duration <= PLAN_END_MINUTES) {
    if (!overlaps(blocks, cursor, duration)) return cursor;
    cursor += 15;
  }
  return Math.max(dayStart, PLAN_END_MINUTES - duration);
}

function cloneSeed(seed: PlannerSeed): PlannerSeed {
  return {
    ...seed,
    tasks: seed.tasks.map((task) => ({ ...task })),
    availableTags: [...seed.availableTags],
    blocks: seed.blocks.map((block) => ({ ...block })),
  };
}

export function createPlannerStore(seed: PlannerSeed) {
  return createStore<PlannerState>((set, get) => {
    const initial = cloneSeed(seed);
    const context = () => {
      const state = get();
      if (!state.userId || !state.dailyPlanId) return null;
      return {
        userId: state.userId,
        dailyPlanId: state.dailyPlanId,
        planDate: state.planDate,
        timezone: state.timezone,
      };
    };
    const pendingWrites = new Set<Promise<void>>();
    let writeQueue = Promise.resolve();
    const save = (operation: () => Promise<void>) => {
      const pending = writeQueue
        .then(operation)
        .catch(() => set({ notice: "저장하지 못했어요. 연결을 확인해 주세요." }))
        .finally(() => pendingWrites.delete(pending));
      writeQueue = pending;
      pendingWrites.add(pending);
    };

    return {
      ...initial,
      mobileView: "schedule",
      notice: null,

      addTag: (name) => {
        const cleanTag = normalizeTagName(name);
        const state = get();
        if (state.availableTags.some((tag) => tag.localeCompare(cleanTag, "ko", { sensitivity: "base" }) === 0)) {
          set({ notice: "이미 있는 태그예요." });
          return;
        }
        set({
          availableTags: tagSuggestions([...state.availableTags, cleanTag]),
          notice: `‘${cleanTag}’ 태그를 추가했어요.`,
        });
        const ctx = context();
        if (ctx) save(() => persistTagCreate(ctx, cleanTag, colorForTag(cleanTag)));
      },

      setDayStartHour: (hour) => {
        const dayStartHour = validDayStartHour(hour);
        set({ dayStartHour, notice: `시간표 시작을 오전 ${dayStartHour}시로 바꿨어요.` });
        const ctx = context();
        if (ctx) save(() => persistDayStartHour(ctx, dayStartHour));
      },

      addTask: (title, tag, estimate) => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return;
        const cleanTag = normalizeTagName(tag);
        const task: Task = {
          id: crypto.randomUUID(), title: cleanTitle, estimate,
          tag: cleanTag, color: colorForTag(cleanTag), energy: "보통",
          isMit: false, completed: false,
        };
        set((state) => ({
          tasks: [task, ...state.tasks],
          availableTags: tagSuggestions([...state.availableTags, cleanTag]),
          notice: "브레인덤프에 추가했어요.",
        }));
        const ctx = context();
        if (ctx) save(() => persistTaskCreate(ctx, task));
      },

      updateTask: (taskId, patch, reason) => {
        const state = get();
        const target = state.tasks.find((task) => task.id === taskId);
        const cleanTitle = patch.title.trim();
        if (!target || !cleanTitle) return false;
        const linkedBlock = state.blocks.find((block) => block.taskId === taskId);
        const estimateChanged = patch.estimate !== target.estimate;
        if (linkedBlock && estimateChanged && state.planStatus === "closed") {
          set({ notice: "일과를 완료한 일정의 예상 시간은 바꿀 수 없어요." });
          return false;
        }
        if (linkedBlock && estimateChanged && state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정 후 예상 시간을 바꾸려면 변경 이유가 필요해요." });
          return false;
        }
        const safeEstimate = Math.max(15, Math.min(Math.round(patch.estimate / 15) * 15, linkedBlock ? PLAN_END_MINUTES - linkedBlock.start : 480));
        if (linkedBlock && estimateChanged && overlaps(state.blocks, linkedBlock.start, safeEstimate, linkedBlock.id)) {
          set({ notice: "다음 일정과 겹쳐서 예상 시간을 바꿀 수 없어요." });
          return false;
        }
        const cleanTag = normalizeTagName(patch.tag);
        const nextTask: Task = {
          ...target,
          title: cleanTitle,
          tag: cleanTag,
          estimate: safeEstimate,
          color: colorForTag(cleanTag),
        };
        const changeReasons = linkedBlock && estimateChanged && state.planStatus === "committed"
          ? { ...linkedBlock.changeReasons, resized: reason?.trim() }
          : linkedBlock?.changeReasons;
        set({
          tasks: state.tasks.map((task) => task.id === taskId ? nextTask : task),
          availableTags: tagSuggestions([...state.availableTags, cleanTag]),
          blocks: state.planStatus === "closed"
            ? state.blocks
            : state.blocks.map((block) => block.taskId === taskId
              ? {
                ...block,
                title: nextTask.title,
                color: nextTask.color,
                duration: estimateChanged ? safeEstimate : block.duration,
                changeReasons: block.id === linkedBlock?.id ? changeReasons : block.changeReasons,
              }
              : block),
          notice: linkedBlock && estimateChanged
            ? "예상 시간과 연결된 타임블록 크기를 함께 바꿨어요."
            : "할 일 정보를 바꿨어요.",
        });
        const ctx = context();
        if (ctx) {
          save(() => persistTaskUpdate(ctx, nextTask, state.planStatus !== "closed"));
          if (linkedBlock && estimateChanged) {
            save(() => persistBlockMove(ctx, linkedBlock.id, linkedBlock.start, safeEstimate, changeReasons));
          }
        }
        return true;
      },

      toggleMit: (taskId) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 해당 날짜의 우선순위를 바꿀 수 없어요." });
          return;
        }
        const target = state.tasks.find((task) => task.id === taskId);
        if (!target) return;
        if (!target.isMit && state.tasks.filter((task) => task.isMit && !task.completed).length >= 3) {
          set({ notice: "해당 날짜의 핵심 업무는 최대 3개까지 선택할 수 있어요." });
          return;
        }
        const tasks = state.tasks.map((task) => task.id === taskId ? { ...task, isMit: !task.isMit } : task);
        set({ tasks, notice: target.isMit ? "핵심 업무에서 뺐어요." : "해당 날짜의 핵심 업무로 정했어요." });
        const ctx = context();
        if (ctx) save(() => persistPriorities(ctx, tasks.filter((task) => task.isMit && !task.completed).map((task) => task.id)));
      },

      scheduleTask: (taskId, requestedStart, reason) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 일정을 바꿀 수 없어요." });
          return;
        }
        if (state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정 후 일정을 추가하려면 변경 이유가 필요해요." });
          return;
        }
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) return;
        if (state.blocks.some((block) => block.taskId === taskId)) {
          set({ notice: "이미 시간표에 배치한 작업이에요. 기존 블록을 옮겨 주세요." });
          return;
        }
        const duration = task.estimate;
        const desiredStart = requestedStart ?? nextAvailableStart(state.blocks, duration, state.dayStartHour);
        if (requestedStart !== undefined && overlaps(state.blocks, desiredStart, duration)) {
          set({ notice: "이미 다른 일정이 있는 시간이에요. 빈 칸에 배치해 주세요." });
          return;
        }
        const block: TimeBlock = {
          id: crypto.randomUUID(), taskId: task.id, title: task.title,
          start: Math.max(state.dayStartHour * 60, Math.min(desiredStart, PLAN_END_MINUTES - duration)),
          duration, type: "task", color: task.color, status: "scheduled",
          changeReasons: state.planStatus === "committed" ? { created: reason?.trim() } : undefined,
        };
        set({ blocks: [...state.blocks, block], selectedBlockId: block.id, mobileView: "schedule", notice: `${task.estimate}분 작업을 일정에 배치했어요.` });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockCreate(ctx, block));
        }
      },

      moveBlock: (blockId, start, reason) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 일정을 바꿀 수 없어요." });
          return;
        }
        if (state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정 후 시간을 옮기려면 변경 이유가 필요해요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const safeStart = Math.max(state.dayStartHour * 60, Math.min(start, PLAN_END_MINUTES - block.duration));
        if (overlaps(state.blocks, safeStart, block.duration, blockId)) {
          set({ notice: "다른 일정과 겹칠 수 없어요. 빈 시간으로 옮겨 주세요." });
          return;
        }
        const changeReasons = state.planStatus === "committed" ? { ...block.changeReasons, moved: reason?.trim() } : block.changeReasons;
        set({ blocks: state.blocks.map((item) => item.id === blockId ? { ...item, start: safeStart, changeReasons } : item), selectedBlockId: blockId, notice: "타임블록 시간을 옮겼어요." });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockMove(ctx, blockId, safeStart, block.duration, changeReasons));
        }
      },

      previewResizeBlock: (blockId, duration) => {
        const state = get();
        if (state.planStatus === "closed") return;
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const snapped = Math.round(duration / 15) * 15;
        const safeDuration = Math.max(15, Math.min(snapped, PLAN_END_MINUTES - block.start));
        if (overlaps(state.blocks, block.start, safeDuration, blockId)) return;
        set({
          blocks: state.blocks.map((item) => item.id === blockId ? { ...item, duration: safeDuration } : item),
          tasks: block.taskId
            ? state.tasks.map((task) => task.id === block.taskId ? { ...task, estimate: safeDuration } : task)
            : state.tasks,
          selectedBlockId: blockId,
        });
      },

      resizeBlock: (blockId, duration, originalDuration, reason) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 일정을 바꿀 수 없어요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        if (state.planStatus === "committed" && !reason?.trim()) {
          if (originalDuration !== undefined) {
            set((current) => ({
              blocks: current.blocks.map((item) => item.id === blockId ? { ...item, duration: originalDuration } : item),
              tasks: block.taskId ? current.tasks.map((task) => task.id === block.taskId ? { ...task, estimate: originalDuration } : task) : current.tasks,
            }));
          }
          set({ notice: "확정 후 시간을 조정하려면 변경 이유가 필요해요." });
          return;
        }
        const previousDuration = originalDuration ?? block.duration;
        const snapped = Math.round(duration / 15) * 15;
        const safeDuration = Math.max(15, Math.min(snapped, PLAN_END_MINUTES - block.start));
        if (overlaps(state.blocks, block.start, safeDuration, blockId)) {
          set({
            blocks: state.blocks.map((item) => item.id === blockId ? { ...item, duration: previousDuration } : item),
            tasks: block.taskId
              ? state.tasks.map((task) => task.id === block.taskId ? { ...task, estimate: previousDuration } : task)
              : state.tasks,
            notice: "다음 일정과 겹치지 않는 범위에서만 늘릴 수 있어요.",
          });
          return;
        }
        const changeReasons = state.planStatus === "committed" ? { ...block.changeReasons, resized: reason?.trim() } : block.changeReasons;
        set({
          blocks: state.blocks.map((item) => item.id === blockId
            ? { ...item, duration: safeDuration, changeReasons }
            : item),
          tasks: block.taskId
            ? state.tasks.map((task) => task.id === block.taskId ? { ...task, estimate: safeDuration } : task)
            : state.tasks,
          selectedBlockId: blockId,
          notice: `타임블록을 ${safeDuration}분으로 조정했어요.`,
        });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockMove(ctx, blockId, block.start, safeDuration, changeReasons));
          const taskId = block.taskId;
          if (taskId) save(() => persistTaskEstimate(ctx, taskId, safeDuration));
        }
      },

      removeBlock: (blockId, reason) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 일정을 바꿀 수 없어요." });
          return;
        }
        if (state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정 후 일정을 빼려면 변경 이유가 필요해요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const changeReasons = state.planStatus === "committed" ? { ...block.changeReasons, cancelled: reason?.trim() } : block.changeReasons;
        const blocks = state.blocks.filter((item) => item.id !== blockId);
        const isCommittedChange = state.planStatus === "committed";
        set({
          blocks,
          selectedBlockId: blocks[0]?.id ?? null,
          notice: isCommittedChange
            ? "시간표에서 뺐어요. 일과를 완료하면 최종 차이에 반영돼요."
            : block.taskId
              ? "시간표에서 뺐어요. 작업은 브레인덤프에 남아 있어요."
              : "타임블록을 삭제했어요.",
        });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockCancel(ctx, blockId, changeReasons));
        }
      },

      selectBlock: (selectedBlockId) => set({ selectedBlockId }),

      toggleBlockComplete: (blockId) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 완료 상태를 바꿀 수 없어요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const completed = block.status !== "completed";
        set({
          blocks: state.blocks.map((item) => item.id === blockId ? { ...item, status: completed ? "completed" : "scheduled", actualMinutes: completed ? item.actualMinutes ?? item.duration : item.actualMinutes } : item),
          tasks: block.taskId ? state.tasks.map((task) => task.id === block.taskId ? { ...task, completed } : task) : state.tasks,
          notice: completed ? "완료했어요. 브레인덤프에서도 정리했어요!" : "완료를 취소했어요.",
        });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockCompletion(ctx, block, completed, block.actualMinutes ?? block.duration));
        }
      },

      updateActualMinutes: (blockId, minutes) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 실제 시간을 바꿀 수 없어요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const actualMinutes = Math.max(5, Math.min(minutes, 480));
        set({ blocks: state.blocks.map((item) => item.id === blockId ? { ...item, actualMinutes } : item) });
        const ctx = context();
        if (ctx) save(() => persistActualMinutes(ctx, block, actualMinutes));
      },

      addBufferAfter: (blockId, reason) => {
        const state = get();
        if (state.planStatus === "closed") {
          set({ notice: "일과를 완료한 뒤에는 일정을 바꿀 수 없어요." });
          return;
        }
        if (state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정 후 여유 시간을 추가하려면 변경 이유가 필요해요." });
          return;
        }
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const bufferStart = block.start + block.duration;
        if (bufferStart + 15 > PLAN_END_MINUTES || overlaps(state.blocks, bufferStart, 15)) {
          set({ notice: "바로 뒤에 15분 버퍼를 넣을 빈 시간이 없어요." });
          return;
        }
        const buffer: TimeBlock = { id: crypto.randomUUID(), title: "버퍼 타임", start: bufferStart, duration: 15, type: "buffer", color: "green", status: "scheduled", changeReasons: state.planStatus === "committed" ? { created: reason?.trim() } : undefined };
        set({ blocks: [...state.blocks, buffer], selectedBlockId: buffer.id, notice: "뒤에 15분 버퍼를 추가했어요." });
        const ctx = context();
        if (ctx) {
          save(() => persistBlockCreate(ctx, buffer));
        }
      },

      discardTask: (taskId, reason) => {
        const state = get();
        const linkedBlock = state.blocks.find((block) => block.taskId === taskId);
        if (linkedBlock && state.planStatus === "closed") {
          set({ notice: "일과를 완료한 일정의 작업은 삭제할 수 없어요." });
          return;
        }
        if (linkedBlock && state.planStatus === "committed" && !reason?.trim()) {
          set({ notice: "확정된 일정의 작업을 삭제하려면 변경 이유가 필요해요." });
          return;
        }
        const changeReasons = linkedBlock && state.planStatus === "committed"
          ? { ...linkedBlock.changeReasons, cancelled: reason?.trim() }
          : linkedBlock?.changeReasons;
        const blocks = linkedBlock ? state.blocks.filter((block) => block.id !== linkedBlock.id) : state.blocks;
        set({
          tasks: state.tasks.filter((task) => task.id !== taskId),
          blocks,
          selectedBlockId: linkedBlock && state.selectedBlockId === linkedBlock.id ? blocks[0]?.id ?? null : state.selectedBlockId,
          notice: linkedBlock
            ? "할 일과 연결된 타임블록을 함께 삭제했어요."
            : "할 일을 휴지통으로 옮겼어요.",
        });
        const ctx = context();
        if (ctx) {
          if (linkedBlock) save(() => persistBlockCancel(ctx, linkedBlock.id, changeReasons));
          save(() => persistTaskDiscard(ctx, taskId));
        }
      },

      setMobileView: (mobileView) => set({ mobileView }),
      setJournal: (journal) => set({ journal }),
      setMood: (mood) => set({ mood }),
      saveJournal: (silent = false) => {
        const state = get();
        const ctx = context();
        if (ctx) save(() => persistReflection(ctx, state.journal, state.mood));
        if (!silent) set({ notice: "오늘의 기록을 저장했어요." });
      },
      confirmPlan: () => {
        const state = get();
        if (state.planStatus !== "draft") {
          set({ notice: state.planStatus === "closed" ? "이 날짜의 일과를 이미 완료했어요." : "이미 확정한 계획이에요." });
          return;
        }
        if (!state.blocks.length) {
          set({ notice: "타임블록을 하나 이상 배치한 뒤 확정해 주세요." });
          return;
        }
        const blocks = state.blocks.map((block) => ({
          ...block,
          baselineStart: block.start,
          baselineDuration: block.duration,
          changeReasons: undefined,
        }));
        set({ blocks, planStatus: "committed", notice: "선택한 날짜의 계획을 확정했어요. 완료 전까지 자유롭게 조정할 수 있어요." });
        const ctx = context();
        if (ctx) save(() => persistPlanCommit(ctx, blocks));
      },
      closePlan: () => {
        const state = get();
        if (state.planStatus === "draft") {
          set({ notice: "먼저 선택한 날짜의 계획을 확정해 주세요." });
          return;
        }
        if (state.planStatus === "closed") {
          set({ notice: "이 날짜의 일과를 이미 완료했어요." });
          return;
        }
        if (state.planDate > dateInTimeZone(state.timezone)) {
          set({ notice: "미래 계획은 해당 날짜가 된 뒤 일과 완료할 수 있어요." });
          return;
        }

        const ctx = context();
        set({ planStatus: "closed", notice: "최종 일정과 확정 계획을 비교하고 있어요." });
        if (!ctx) {
          set({ notice: "일과를 완료했어요. 최종 상태로 잠갔어요." });
          return;
        }

        void Promise.all([...pendingWrites])
          .then(() => persistPlanClose(ctx, state.blocks))
          .then((changeCount) => set({
            notice: changeCount > 0
              ? `일과를 완료했어요. 최종 차이 ${changeCount}개를 기록했어요.`
              : "일과를 완료했어요. 확정 계획과 최종 일정이 같아요.",
          }))
          .catch(() => set({
            planStatus: "committed",
            notice: "일과를 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
          }));
      },
      setNotice: (notice) => set({ notice }),
    };
  });
}

type PlannerStoreApi = ReturnType<typeof createPlannerStore>;
const PlannerStoreContext = createContext<PlannerStoreApi | null>(null);

export function PlannerStoreProvider({ seed, children }: { seed: PlannerSeed; children: ReactNode }) {
  const [store] = useState(() => createPlannerStore(seed));
  return <PlannerStoreContext.Provider value={store}>{children}</PlannerStoreContext.Provider>;
}

export function usePlannerStore<T>(selector: (state: PlannerState) => T): T {
  const store = useContext(PlannerStoreContext);
  if (!store) throw new Error("PlannerStoreProvider가 필요합니다.");
  return useStore(store, selector);
}
