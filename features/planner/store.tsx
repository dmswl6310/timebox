"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  persistActualMinutes,
  persistBlockCompletion,
  persistBlockCreate,
  persistBlockMove,
  persistPlanCommit,
  persistPriorities,
  persistReflection,
  persistScheduleChange,
  persistTaskCreate,
  persistTaskDiscard,
  persistTaskUpdate,
} from "./persistence";
import type { MobileView, PlanStatus, TagName, Task, TimeBlock } from "./types";

export type PlannerSeed = {
  userId: string | null;
  dailyPlanId: string | null;
  planDate: string;
  timezone: string;
  tasks: Task[];
  blocks: TimeBlock[];
  selectedBlockId: string | null;
  journal: string;
  mood: number;
  planStatus: PlanStatus;
};

const tagColors: Record<TagName, Task["color"]> = {
  자소서: "coral",
  면접: "violet",
  일상: "blue",
  메시지: "amber",
  성장: "green",
  업무: "blue",
  미분류: "slate",
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
  dailyPlanId: null,
  planDate: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
  timezone: "Asia/Seoul",
  tasks: demoTasks,
  blocks: demoBlocks,
  selectedBlockId: "block-interview",
  journal: "오전에는 생각보다 집중이 잘 됐다. 면접 답변은 완벽하게 하려기보다 먼저 끝까지 말해보는 데 집중하자.",
  mood: 4,
  planStatus: "draft",
};

export type PlannerState = PlannerSeed & {
  mobileView: MobileView;
  notice: string | null;
  addTask: (title: string, tag: TagName, estimate: number) => void;
  updateTask: (taskId: string, patch: Pick<Task, "title" | "tag" | "estimate">) => void;
  toggleMit: (taskId: string) => void;
  scheduleTask: (taskId: string, start?: number) => void;
  moveBlock: (blockId: string, start: number) => void;
  previewResizeBlock: (blockId: string, duration: number) => void;
  resizeBlock: (blockId: string, duration: number, originalDuration?: number) => void;
  selectBlock: (blockId: string) => void;
  toggleBlockComplete: (blockId: string) => void;
  updateActualMinutes: (blockId: string, minutes: number) => void;
  addBufferAfter: (blockId: string) => void;
  discardTask: (taskId: string) => void;
  setMobileView: (view: MobileView) => void;
  setJournal: (value: string) => void;
  setMood: (value: number) => void;
  saveJournal: (silent?: boolean) => void;
  confirmPlan: () => void;
  setNotice: (value: string | null) => void;
};

function overlaps(blocks: TimeBlock[], start: number, duration: number) {
  return blocks.some((block) => start < block.start + block.duration && start + duration > block.start);
}

function nextAvailableStart(blocks: TimeBlock[], duration: number) {
  let cursor = 5 * 60;
  while (cursor + duration <= 24 * 60) {
    if (!overlaps(blocks, cursor, duration)) return cursor;
    cursor += 15;
  }
  return Math.max(5 * 60, 24 * 60 - duration);
}

function cloneSeed(seed: PlannerSeed): PlannerSeed {
  return {
    ...seed,
    tasks: seed.tasks.map((task) => ({ ...task })),
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
    const save = (promise: Promise<void>) => {
      void promise.catch(() => set({ notice: "저장하지 못했어요. 연결을 확인해 주세요." }));
    };
    const track = (promise: Promise<void>) => {
      void promise.catch(() => undefined);
    };

    return {
      ...initial,
      mobileView: "schedule",
      notice: null,

      addTask: (title, tag, estimate) => {
        const cleanTitle = title.trim();
        if (!cleanTitle) return;
        const task: Task = {
          id: crypto.randomUUID(), title: cleanTitle, estimate,
          tag, color: tagColors[tag], energy: "보통",
          isMit: false, completed: false,
        };
        set((state) => ({ tasks: [task, ...state.tasks], notice: "브레인덤프에 추가했어요." }));
        const ctx = context();
        if (ctx) save(persistTaskCreate(ctx, task));
      },

      updateTask: (taskId, patch) => {
        const state = get();
        const target = state.tasks.find((task) => task.id === taskId);
        const cleanTitle = patch.title.trim();
        if (!target || !cleanTitle) return;
        const nextTask: Task = {
          ...target,
          title: cleanTitle,
          tag: patch.tag,
          estimate: patch.estimate,
          color: tagColors[patch.tag],
        };
        set({
          tasks: state.tasks.map((task) => task.id === taskId ? nextTask : task),
          blocks: state.blocks.map((block) => block.taskId === taskId
            ? { ...block, title: nextTask.title, color: nextTask.color }
            : block),
          notice: "할 일 정보를 바꿨어요.",
        });
        const ctx = context();
        if (ctx) save(persistTaskUpdate(ctx, nextTask));
      },

      toggleMit: (taskId) => {
        const state = get();
        const target = state.tasks.find((task) => task.id === taskId);
        if (!target) return;
        if (!target.isMit && state.tasks.filter((task) => task.isMit && !task.completed).length >= 3) {
          set({ notice: "오늘의 핵심 업무는 최대 3개까지 선택할 수 있어요." });
          return;
        }
        const tasks = state.tasks.map((task) => task.id === taskId ? { ...task, isMit: !task.isMit } : task);
        set({ tasks, notice: target.isMit ? "핵심 업무에서 뺐어요." : "오늘의 핵심 업무로 정했어요." });
        const ctx = context();
        if (ctx) save(persistPriorities(ctx, tasks.filter((task) => task.isMit && !task.completed).map((task) => task.id)));
      },

      scheduleTask: (taskId, requestedStart) => {
        const state = get();
        const task = state.tasks.find((item) => item.id === taskId);
        if (!task) return;
        const duration = task.estimate;
        const desiredStart = requestedStart ?? nextAvailableStart(state.blocks, duration);
        const block: TimeBlock = {
          id: crypto.randomUUID(), taskId: task.id, title: task.title,
          start: Math.max(5 * 60, Math.min(desiredStart, 24 * 60 - duration)),
          duration, type: "task", color: task.color, status: "scheduled",
        };
        set({ blocks: [...state.blocks, block], selectedBlockId: block.id, mobileView: "schedule", notice: `${task.estimate}분 작업을 일정에 배치했어요.` });
        const ctx = context();
        if (ctx) {
          save(persistBlockCreate(ctx, block));
          if (state.planStatus !== "draft") {
            track(persistScheduleChange(ctx, {
              blockId: block.id,
              type: "created",
              after: { start: block.start, duration: block.duration, title: block.title },
            }));
          }
        }
      },

      moveBlock: (blockId, start) => {
        const state = get();
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const safeStart = Math.max(5 * 60, Math.min(start, 24 * 60 - block.duration));
        set({ blocks: state.blocks.map((item) => item.id === blockId ? { ...item, start: safeStart } : item), selectedBlockId: blockId, notice: "타임블록 시간을 옮겼어요." });
        const ctx = context();
        if (ctx) {
          save(persistBlockMove(ctx, blockId, safeStart, block.duration));
          if (state.planStatus !== "draft" && block.start !== safeStart) {
            track(persistScheduleChange(ctx, {
              blockId,
              type: "moved",
              before: { start: block.start, duration: block.duration },
              after: { start: safeStart, duration: block.duration },
            }));
          }
        }
      },

      previewResizeBlock: (blockId, duration) => {
        const state = get();
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const snapped = Math.round(duration / 15) * 15;
        const safeDuration = Math.max(15, Math.min(snapped, 24 * 60 - block.start));
        set({
          blocks: state.blocks.map((item) => item.id === blockId ? { ...item, duration: safeDuration } : item),
          selectedBlockId: blockId,
        });
      },

      resizeBlock: (blockId, duration, originalDuration) => {
        const state = get();
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const previousDuration = originalDuration ?? block.duration;
        const snapped = Math.round(duration / 15) * 15;
        const safeDuration = Math.max(15, Math.min(snapped, 24 * 60 - block.start));
        set({
          blocks: state.blocks.map((item) => item.id === blockId
            ? { ...item, duration: safeDuration }
            : item),
          selectedBlockId: blockId,
          notice: `타임블록을 ${safeDuration}분으로 조정했어요.`,
        });
        const ctx = context();
        if (ctx) {
          save(persistBlockMove(ctx, blockId, block.start, safeDuration));
          if (state.planStatus !== "draft" && previousDuration !== safeDuration) {
            track(persistScheduleChange(ctx, {
              blockId,
              type: "resized",
              before: { start: block.start, duration: previousDuration },
              after: { start: block.start, duration: safeDuration },
            }));
          }
        }
      },

      selectBlock: (selectedBlockId) => set({ selectedBlockId }),

      toggleBlockComplete: (blockId) => {
        const state = get();
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
          save(persistBlockCompletion(ctx, block, completed));
          track(persistScheduleChange(ctx, {
            blockId,
            type: completed ? "completed" : "reopened",
            before: { status: block.status },
            after: { status: completed ? "completed" : "scheduled" },
          }));
        }
      },

      updateActualMinutes: (blockId, minutes) => {
        const state = get();
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const actualMinutes = Math.max(5, Math.min(minutes, 480));
        set({ blocks: state.blocks.map((item) => item.id === blockId ? { ...item, actualMinutes } : item) });
        const ctx = context();
        if (ctx) save(persistActualMinutes(ctx, block, actualMinutes));
      },

      addBufferAfter: (blockId) => {
        const state = get();
        const block = state.blocks.find((item) => item.id === blockId);
        if (!block) return;
        const buffer: TimeBlock = { id: crypto.randomUUID(), title: "버퍼 타임", start: block.start + block.duration, duration: 15, type: "buffer", color: "green", status: "scheduled" };
        set({ blocks: [...state.blocks, buffer], selectedBlockId: buffer.id, notice: "뒤에 15분 버퍼를 추가했어요." });
        const ctx = context();
        if (ctx) {
          save(persistBlockCreate(ctx, buffer));
          if (state.planStatus !== "draft") {
            track(persistScheduleChange(ctx, {
              blockId: buffer.id,
              type: "created",
              after: { start: buffer.start, duration: buffer.duration, title: buffer.title },
            }));
          }
        }
      },

      discardTask: (taskId) => {
        set((state) => ({ tasks: state.tasks.filter((task) => task.id !== taskId), notice: "할 일을 휴지통으로 옮겼어요." }));
        const ctx = context();
        if (ctx) save(persistTaskDiscard(ctx, taskId));
      },

      setMobileView: (mobileView) => set({ mobileView }),
      setJournal: (journal) => set({ journal }),
      setMood: (mood) => set({ mood }),
      saveJournal: (silent = false) => {
        const state = get();
        const ctx = context();
        if (ctx) save(persistReflection(ctx, state.journal, state.mood));
        if (!silent) set({ notice: "오늘의 기록을 저장했어요." });
      },
      confirmPlan: () => {
        const state = get();
        if (state.planStatus !== "draft") {
          set({ notice: "이미 확정한 계획이에요. 이후 변경은 비교 내역에 남아요." });
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
        }));
        set({ blocks, planStatus: "committed", notice: "오늘 계획을 확정했어요. 이후 변경은 자동으로 비교돼요." });
        const ctx = context();
        if (ctx) save(persistPlanCommit(ctx, blocks));
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
