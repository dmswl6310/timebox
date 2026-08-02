"use client";

import { create } from "zustand";
import type { MobileView, TagName, Task, TimeBlock } from "./types";

const initialTasks: Task[] = [
  {
    id: "task-portfolio",
    title: "포트폴리오 핵심 문장 다듬기",
    estimate: 60,
    tag: "자소서",
    color: "coral",
    energy: "높음",
    isMit: true,
    completed: false,
  },
  {
    id: "task-interview",
    title: "모의 면접 답변 녹음하기",
    estimate: 30,
    tag: "면접",
    color: "violet",
    energy: "높음",
    isMit: true,
    completed: false,
  },
  {
    id: "task-budget",
    title: "이번 주 생활비 정리하기",
    estimate: 30,
    tag: "일상",
    color: "blue",
    energy: "낮음",
    isMit: true,
    completed: false,
  },
  {
    id: "task-reply",
    title: "민지에게 회의 일정 답장하기",
    estimate: 15,
    tag: "메시지",
    color: "amber",
    energy: "낮음",
    isMit: false,
    completed: false,
  },
  {
    id: "task-reading",
    title: "타임박싱 책 20쪽 읽기",
    estimate: 30,
    tag: "성장",
    color: "green",
    energy: "보통",
    isMit: false,
    completed: false,
  },
  {
    id: "task-laundry",
    title: "세탁기 돌리고 빨래 널기",
    estimate: 30,
    tag: "일상",
    color: "blue",
    energy: "낮음",
    isMit: false,
    completed: false,
  },
];

const initialBlocks: TimeBlock[] = [
  {
    id: "block-plan",
    title: "오늘 계획 세우기",
    start: 8 * 60 + 30,
    duration: 15,
    actualMinutes: 15,
    type: "planning",
    color: "slate",
    status: "completed",
  },
  {
    id: "block-portfolio",
    taskId: "task-portfolio",
    title: "포트폴리오 핵심 문장 다듬기",
    start: 9 * 60,
    duration: 60,
    actualMinutes: 52,
    type: "task",
    color: "coral",
    status: "completed",
  },
  {
    id: "block-buffer-1",
    title: "숨 고르기",
    start: 10 * 60,
    duration: 15,
    type: "buffer",
    color: "green",
    status: "scheduled",
  },
  {
    id: "block-meeting",
    title: "팀 주간 싱크",
    start: 10 * 60 + 30,
    duration: 30,
    type: "appointment",
    color: "blue",
    status: "scheduled",
  },
  {
    id: "block-interview",
    taskId: "task-interview",
    title: "모의 면접 답변 녹음하기",
    start: 13 * 60,
    duration: 30,
    type: "task",
    color: "violet",
    status: "running",
  },
  {
    id: "block-lunch",
    title: "점심 · 산책",
    start: 13 * 60 + 45,
    duration: 60,
    type: "buffer",
    color: "green",
    status: "scheduled",
  },
  {
    id: "block-budget",
    taskId: "task-budget",
    title: "이번 주 생활비 정리하기",
    start: 16 * 60,
    duration: 30,
    type: "task",
    color: "blue",
    status: "scheduled",
  },
];

type PlannerState = {
  tasks: Task[];
  blocks: TimeBlock[];
  selectedBlockId: string | null;
  mobileView: MobileView;
  journal: string;
  mood: number;
  notice: string | null;
  addTask: (title: string) => void;
  toggleMit: (taskId: string) => void;
  scheduleTask: (taskId: string, start?: number) => void;
  moveBlock: (blockId: string, start: number) => void;
  selectBlock: (blockId: string) => void;
  toggleBlockComplete: (blockId: string) => void;
  updateActualMinutes: (blockId: string, minutes: number) => void;
  addBufferAfter: (blockId: string) => void;
  discardTask: (taskId: string) => void;
  setMobileView: (view: MobileView) => void;
  setJournal: (value: string) => void;
  setMood: (value: number) => void;
  setNotice: (value: string | null) => void;
};

function overlaps(blocks: TimeBlock[], start: number, duration: number) {
  return blocks.some(
    (block) => start < block.start + block.duration && start + duration > block.start,
  );
}

function nextAvailableStart(blocks: TimeBlock[], duration: number) {
  let cursor = 9 * 60;

  while (cursor + duration <= 20 * 60) {
    if (!overlaps(blocks, cursor, duration)) return cursor;
    cursor += 15;
  }

  return 18 * 60;
}

export const usePlannerStore = create<PlannerState>((set, get) => ({
  tasks: initialTasks,
  blocks: initialBlocks,
  selectedBlockId: "block-interview",
  mobileView: "schedule",
  journal:
    "오전에는 생각보다 집중이 잘 됐다. 면접 답변은 완벽하게 하려기보다 먼저 끝까지 말해보는 데 집중하자.",
  mood: 4,
  notice: null,

  addTask: (title) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    set((state) => ({
      tasks: [
        {
          id: crypto.randomUUID(),
          title: cleanTitle,
          estimate: 30,
          tag: "미분류" as TagName,
          color: "slate",
          energy: "보통",
          isMit: false,
          completed: false,
        },
        ...state.tasks,
      ],
      notice: "브레인덤프에 추가했어요.",
    }));
  },

  toggleMit: (taskId) => {
    const state = get();
    const target = state.tasks.find((task) => task.id === taskId);
    if (!target) return;

    if (!target.isMit && state.tasks.filter((task) => task.isMit && !task.completed).length >= 3) {
      set({ notice: "오늘의 핵심 업무는 최대 3개까지 선택할 수 있어요." });
      return;
    }

    set({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, isMit: !task.isMit } : task,
      ),
      notice: target.isMit ? "핵심 업무에서 뺐어요." : "오늘의 핵심 업무로 정했어요.",
    });
  },

  scheduleTask: (taskId, requestedStart) => {
    const state = get();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const duration = Math.min(task.estimate, 60);
    const start = requestedStart ?? nextAvailableStart(state.blocks, duration);
    const newBlock: TimeBlock = {
      id: crypto.randomUUID(),
      taskId: task.id,
      title: task.title,
      start,
      duration,
      type: "task",
      color: task.color,
      status: "scheduled",
    };

    set({
      blocks: [...state.blocks, newBlock],
      selectedBlockId: newBlock.id,
      mobileView: "schedule",
      notice: `${task.estimate}분 작업을 일정에 배치했어요.`,
    });
  },

  moveBlock: (blockId, start) => {
    const safeStart = Math.max(8 * 60, Math.min(start, 19 * 60 + 45));
    set((state) => ({
      blocks: state.blocks.map((block) =>
        block.id === blockId ? { ...block, start: safeStart } : block,
      ),
      selectedBlockId: blockId,
      notice: "타임블록 시간을 옮겼어요.",
    }));
  },

  selectBlock: (blockId) => set({ selectedBlockId: blockId }),

  toggleBlockComplete: (blockId) => {
    const state = get();
    const block = state.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const completed = block.status !== "completed";

    set({
      blocks: state.blocks.map((item) =>
        item.id === blockId
          ? {
              ...item,
              status: completed ? "completed" : "scheduled",
              actualMinutes: completed ? item.actualMinutes ?? item.duration : item.actualMinutes,
            }
          : item,
      ),
      tasks: block.taskId
        ? state.tasks.map((task) =>
            task.id === block.taskId ? { ...task, completed } : task,
          )
        : state.tasks,
      notice: completed ? "완료했어요. 브레인덤프에서도 정리했어요!" : "완료를 취소했어요.",
    });
  },

  updateActualMinutes: (blockId, minutes) =>
    set((state) => ({
      blocks: state.blocks.map((block) =>
        block.id === blockId
          ? { ...block, actualMinutes: Math.max(5, Math.min(minutes, 480)) }
          : block,
      ),
    })),

  addBufferAfter: (blockId) => {
    const state = get();
    const block = state.blocks.find((item) => item.id === blockId);
    if (!block) return;
    const buffer: TimeBlock = {
      id: crypto.randomUUID(),
      title: "버퍼 타임",
      start: block.start + block.duration,
      duration: 15,
      type: "buffer",
      color: "green",
      status: "scheduled",
    };
    set({
      blocks: [...state.blocks, buffer],
      selectedBlockId: buffer.id,
      notice: "뒤에 15분 버퍼를 추가했어요.",
    });
  },

  discardTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
      notice: "할 일을 휴지통으로 옮겼어요.",
    })),

  setMobileView: (mobileView) => set({ mobileView }),
  setJournal: (journal) => set({ journal }),
  setMood: (mood) => set({ mood }),
  setNotice: (notice) => set({ notice }),
}));
