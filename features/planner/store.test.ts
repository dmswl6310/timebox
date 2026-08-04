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
    userEmail: null,
    dailyPlanId: null,
    planDate: "2026-08-04",
    timezone: "Asia/Seoul",
    dayStartHour: 7,
    tasks,
    availableTags: ["미분류", "업무"],
    blocks,
    selectedBlockId: null,
    journal: "",
    mood: 3,
    planStatus,
  };
}

describe("일정 배치", () => {
  it("자정 이후 00시 30분부터 01시까지 작업을 배치할 수 있다", () => {
    const lateTask = task("task-late", 30);
    const store = createPlannerStore(seed({ tasks: [lateTask] }));

    store.getState().scheduleTask(lateTask.id, 24 * 60 + 30);

    expect(store.getState().blocks[0]).toMatchObject({
      start: 24 * 60 + 30,
      duration: 30,
    });
  });

  it("작업이 다음 날 오전 1시를 넘어가지는 않게 한다", () => {
    const lateTask = task("task-late", 30);
    const store = createPlannerStore(seed({ tasks: [lateTask] }));

    store.getState().scheduleTask(lateTask.id, 25 * 60);

    expect(store.getState().blocks[0]?.start).toBe(24 * 60 + 30);
  });

  it("빈 시간표에는 설정한 기상 시간부터 작업을 자동 배치한다", () => {
    const store = createPlannerStore(seed());

    store.getState().scheduleTask("task-1");

    expect(store.getState().blocks[0]?.start).toBe(7 * 60);
  });

  it("기상 시간보다 이른 위치로 옮기면 하루 시작 시간에 맞춘다", () => {
    const initialBlock = block("block-1", "task-1", 9 * 60);
    const store = createPlannerStore(seed({ blocks: [initialBlock] }));

    store.getState().moveBlock(initialBlock.id, 6 * 60);

    expect(store.getState().blocks[0]?.start).toBe(7 * 60);
  });

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
  it("브레인덤프에서 예상 시간을 바꾸면 연결된 블록 크기도 함께 바꾼다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    const updated = store.getState().updateTask("task-1", {
      title: "작업 task-1",
      tag: "업무",
      estimate: 60,
    });

    expect(updated).toBe(true);
    expect(store.getState().tasks[0]?.estimate).toBe(60);
    expect(store.getState().blocks[0]?.duration).toBe(60);
  });

  it("확정 후 이유 없이 브레인덤프 예상 시간을 바꾸지 않는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    const updated = store.getState().updateTask("task-1", {
      title: "작업 task-1",
      tag: "업무",
      estimate: 60,
    });

    expect(updated).toBe(false);
    expect(store.getState().tasks[0]?.estimate).toBe(30);
    expect(store.getState().blocks[0]?.duration).toBe(30);
  });

  it("확정 후 이유와 함께 바꾼 예상 시간을 블록 변경 이유에 보존한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    const updated = store.getState().updateTask("task-1", {
      title: "작업 task-1",
      tag: "업무",
      estimate: 60,
    }, "집중 검토 시간이 더 필요함");

    expect(updated).toBe(true);
    expect(store.getState().blocks[0]?.duration).toBe(60);
    expect(store.getState().blocks[0]?.changeReasons?.resized).toBe("집중 검토 시간이 더 필요함");
  });

  it("늘린 예상 시간이 다음 일정과 겹치면 작업과 블록을 모두 원래대로 둔다", () => {
    const store = createPlannerStore(seed({
      tasks: [task("task-1"), task("task-2")],
      blocks: [block("block-1", "task-1", 9 * 60), block("block-2", "task-2", 10 * 60)],
    }));

    const updated = store.getState().updateTask("task-1", {
      title: "작업 task-1",
      tag: "업무",
      estimate: 90,
    });

    expect(updated).toBe(false);
    expect(store.getState().tasks.find((item) => item.id === "task-1")?.estimate).toBe(30);
    expect(store.getState().blocks.find((item) => item.id === "block-1")?.duration).toBe(30);
  });

  it("15분 단위로 크기를 맞추고 작업 예상 시간도 함께 바꾼다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    store.getState().resizeBlock("block-1", 47);

    expect(store.getState().blocks[0]?.duration).toBe(45);
    expect(store.getState().tasks[0]?.estimate).toBe(45);
  });

  it("확정 후 변경 모드가 아니면 크기 변경을 막고 원래대로 되돌린다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().previewResizeBlock("block-1", 60);
    store.getState().resizeBlock("block-1", 60, 30);

    expect(store.getState().blocks[0]?.duration).toBe(30);
    expect(store.getState().tasks[0]?.estimate).toBe(30);
    expect(store.getState().notice).toContain("계획 변경");
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

describe("사용자 태그", () => {
  it("원하는 새 태그를 공백을 정리해 내 태그 목록에 추가한다", () => {
    const store = createPlannerStore(seed());

    store.getState().addTag("  사이드   프로젝트  ");

    expect(store.getState().availableTags).toContain("사이드 프로젝트");
    expect(store.getState().notice).toContain("태그를 추가");
  });

  it("대소문자만 다른 중복 태그를 추가하지 않는다", () => {
    const store = createPlannerStore(seed({
      tasks: [{ ...task("task-1"), tag: "Focus" }],
    }));
    store.setState({ availableTags: ["미분류", "Focus"] });

    store.getState().addTag("focus");

    expect(store.getState().availableTags.filter((tag) => tag.toLocaleLowerCase() === "focus")).toHaveLength(1);
    expect(store.getState().notice).toContain("이미 있는 태그");
  });

  it("할 일의 태그를 바꾸면 일정 블록과 내 태그 목록에도 즉시 반영한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    store.getState().updateTask("task-1", {
      title: "작업 task-1",
      tag: "운동",
      estimate: 30,
    });

    expect(store.getState().tasks[0]?.tag).toBe("운동");
    expect(store.getState().availableTags).toContain("운동");
    expect(store.getState().blocks[0]?.color).toBe(store.getState().tasks[0]?.color);
  });
});

describe("브레인덤프 작업 삭제", () => {
  it("확정 전 배치된 작업을 삭제하면 연결된 타임블록도 함께 없앤다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
    }));

    store.getState().discardTask("task-1");

    expect(store.getState().tasks).toHaveLength(0);
    expect(store.getState().blocks).toHaveLength(0);
    expect(store.getState().notice).toContain("함께 삭제");
  });

  it("확정 후 변경 모드가 아니면 배치된 작업을 삭제하지 않는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().discardTask("task-1");

    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().blocks).toHaveLength(1);
    expect(store.getState().notice).toContain("계획 변경");
  });

  it("확정 후 이유를 입력하면 작업과 타임블록을 함께 삭제한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().discardTask("task-1", "오늘 우선순위에서 제외함");

    expect(store.getState().tasks).toHaveLength(0);
    expect(store.getState().blocks).toHaveLength(0);
  });

  it("일과 완료 후에는 배치된 작업과 기록을 보존한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "closed",
    }));

    store.getState().discardTask("task-1");

    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().blocks).toHaveLength(1);
  });
});

describe("하루 시작 시간", () => {
  it("마이페이지에서 선택한 기상 시간을 상태에 저장한다", () => {
    const store = createPlannerStore(seed());

    store.getState().setDayStartHour(8);

    expect(store.getState().dayStartHour).toBe(8);
    expect(store.getState().notice).toContain("오전 8시");
  });

  it("지원 범위를 벗어난 값은 안전한 범위로 제한한다", () => {
    const store = createPlannerStore(seed());

    store.getState().setDayStartHour(2);

    expect(store.getState().dayStartHour).toBe(5);
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

  it("변경 모드에서 여러 조정을 한 뒤 하나의 공통 이유로 확정한다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().beginPlanEdit();
    store.getState().moveBlock("block-1", 10 * 60);
    store.getState().resizeBlock("block-1", 45);

    expect(store.getState().isPlanEditing).toBe(true);
    expect(store.getState().hasPendingPlanChanges).toBe(true);

    const finished = store.getState().finishPlanEdit("오후 약속에 맞춰 집중 시간을 재배치함");

    expect(finished).toBe(true);
    expect(store.getState().isPlanEditing).toBe(false);
    expect(store.getState().blocks[0]?.changeReasons).toMatchObject({
      moved: "오후 약속에 맞춰 집중 시간을 재배치함",
      resized: "오후 약속에 맞춰 집중 시간을 재배치함",
    });
  });

  it("변경 사항이 있으면 공통 이유 없이 변경 모드를 끝내지 않는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().beginPlanEdit();
    store.getState().moveBlock("block-1", 10 * 60);

    expect(store.getState().finishPlanEdit()).toBe(false);
    expect(store.getState().isPlanEditing).toBe(true);
    expect(store.getState().notice).toContain("변경의 이유");
  });

  it("변경 없이 변경 모드를 끝낼 때는 이유를 요구하지 않는다", () => {
    const store = createPlannerStore(seed({
      blocks: [block("block-1", "task-1", 9 * 60)],
      planStatus: "committed",
    }));

    store.getState().beginPlanEdit();

    expect(store.getState().finishPlanEdit()).toBe(true);
    expect(store.getState().isPlanEditing).toBe(false);
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
