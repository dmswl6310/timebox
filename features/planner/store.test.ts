import { describe, expect, it } from "vitest";
import { createPlannerStore, type PlannerSeed } from "./store";
import type { PlanStatus, Task, TimeBlock } from "./types";

const task = (id: string, estimate = 30, isMit = false): Task => ({
  id,
  title: `작업 ${id}`,
  estimate,
  tag: "업무",
  color: "blue",
  energy: "보통",
  isMit,
  completed: false,
});

const block = (
  id: string,
  taskId: string,
  start: number,
  duration = 30,
): TimeBlock => ({
  id,
  taskId,
  title: `작업 ${taskId}`,
  start,
  duration,
  type: "task",
  color: "blue",
  status: "scheduled",
});

function seed({
  tasks = [task("task-1")],
  blocks = [],
  planStatus = "draft",
}: {
  tasks?: Task[];
  blocks?: TimeBlock[];
  planStatus?: PlanStatus;
} = {}): PlannerSeed {
  return {
    userId: null,
    dailyPlanId: null,
    planDate: "2026-08-04",
    timezone: "Asia/Seoul",
    tasks,
    blocks,
    selectedBlockId: null,
    journal: "",
    mood: 3,
    planStatus,
  };
}

describe("일정 배치", () => {
  it("정각에서 15분 위치로 작업을 옮길 수 있다", () => {
    const initialBlock = block("block-1", "task-1", 9 * 60);
    const store = createPlannerStore(seed({ blocks: [initialBlock] }));

    store.getState().moveBlock(initialBlock.id, 9 * 60 + 15);

    expect(store.getState().blocks[0]?.start).toBe(9 * 60 + 15);
  });

  it("요청한 15분 칸에 작업을 정확히 배치한다", () => {
    const store = createPlannerStore(seed());

    store.getState().scheduleTask("task-1", 8 * 60 + 15);

    expect(store.getState().blocks).toHaveLength(1);
    expect(store.getState().blocks[0]?.start).toBe(8 * 60 + 15);
  });

  it("같은 작업을 일정에 두 번 배치하지 않는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    store.getState().scheduleTask("task-1", 10 * 60);

    expect(store.getState().blocks).toHaveLength(1);
    expect(store.getState().notice).toContain("이미 시간표에 배치");
  });

  it("다른 일정과 겹치는 위치로 옮기지 않는다", () => {
    const blocks = [
      block("block-1", "task-1", 9 * 60),
      block("block-2", "task-2", 10 * 60),
    ];
    const store = createPlannerStore(seed({
      tasks: [task("task-1"), task("task-2")],
      blocks,
    }));

    store.getState().moveBlock("block-1", 10 * 60);

    expect(store.getState().blocks.find((item) => item.id === "block-1")?.start).toBe(9 * 60);
    expect(store.getState().notice).toContain("겹칠 수 없어요");
  });
});

describe("일정 크기와 예상 시간 동기화", () => {
  it("15분 단위로 크기를 맞추고 작업 예상 시간도 함께 바꾼다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    store.getState().resizeBlock("block-1", 47);

    expect(store.getState().blocks[0]?.duration).toBe(45);
    expect(store.getState().tasks[0]?.estimate).toBe(45);
  });

  it("확정 후 이유 없이 크기를 바꾸면 미리보기와 예상 시간을 원래대로 되돌린다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().previewResizeBlock("block-1", 60);
    store.getState().resizeBlock("block-1", 60, 30);

    expect(store.getState().blocks[0]?.duration).toBe(30);
    expect(store.getState().tasks[0]?.estimate).toBe(30);
    expect(store.getState().notice).toContain("변경 이유");
  });

  it("확정 후 입력한 마지막 크기 변경 이유를 블록에 보존한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().resizeBlock("block-1", 60, 30, "예상보다 검토할 내용이 많음");

    expect(store.getState().blocks[0]?.duration).toBe(60);
    expect(store.getState().tasks[0]?.estimate).toBe(60);
    expect(store.getState().blocks[0]?.changeReasons?.resized).toBe("예상보다 검토할 내용이 많음");
  });
});

describe("계획 상태 규칙", () => {
  it("핵심 업무를 최대 세 개까지만 선택한다", () => {
    const store = createPlannerStore(seed({
      tasks: [task("task-1", 30, true), task("task-2", 30, true), task("task-3", 30, true), task("task-4")],
    }));

    store.getState().toggleMit("task-4");

    expect(store.getState().tasks.filter((item) => item.isMit)).toHaveLength(3);
    expect(store.getState().notice).toContain("최대 3개");
  });

  it("계획을 확정할 때 블록의 기준 위치와 크기를 저장한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60 + 15, 45)],
    }));

    store.getState().confirmPlan();

    expect(store.getState().planStatus).toBe("committed");
    expect(store.getState().blocks[0]).toMatchObject({
      baselineStart: 9 * 60 + 15,
      baselineDuration: 45,
    });
  });

  it("일과 완료 후에는 일정 삭제를 막는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "closed",
    }));

    store.getState().removeBlock("block-1");

    expect(store.getState().blocks).toHaveLength(1);
    expect(store.getState().notice).toContain("일과를 완료한 뒤");
  });
});
