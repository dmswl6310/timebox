import { describe, expect, it } from "vitest";
import { buildChangeGroups, type ChangeRow } from "./records-data";

const PLAN_ID = "plan-1";
const DATE = "2026-08-06";

function change(overrides: Partial<ChangeRow>): ChangeRow {
  return {
    id: crypto.randomUUID(),
    daily_plan_id: PLAN_ID,
    time_block_id: "block-1",
    change_type: "moved",
    before_state: { title: "집중 작업", start: 600, duration: 60 },
    after_state: { title: "집중 작업", start: 630, duration: 60 },
    reason: "친구와 연락이 길어짐",
    reason_kind: "unexpected_delay",
    created_at: "2026-08-06T12:00:00+09:00",
    ...overrides,
  };
}

describe("계획 변경 요약", () => {
  it("같은 블록의 이동과 크기 변경을 한 항목으로 합친다", () => {
    const rows = [
      change({ change_type: "moved", after_state: { title: "집중 작업", start: 630, duration: 90 } }),
      change({ change_type: "resized", after_state: { title: "집중 작업", start: 630, duration: 90 } }),
    ];

    const groups = buildChangeGroups(rows, new Map([[PLAN_ID, DATE]]));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.reasonKind).toBe("unexpected_delay");
    expect(groups[0]?.items[0]).toMatchObject({
      startDelta: 30,
      durationDelta: 30,
      effects: ["moved_later", "duration_increased"],
    });
  });

  it("앞당김과 시간 축소를 방향에 맞게 분류한다", () => {
    const rows = [change({
      change_type: "resized",
      after_state: { title: "집중 작업", start: 570, duration: 45 },
    })];

    const item = buildChangeGroups(rows, new Map([[PLAN_ID, DATE]]))[0]?.items[0];

    expect(item).toMatchObject({
      startDelta: -30,
      durationDelta: -15,
      effects: ["moved_earlier", "duration_decreased"],
    });
  });

  it("추가와 삭제를 각각 최종 변화로 표시한다", () => {
    const rows = [
      change({ id: "created", time_block_id: "block-created", change_type: "created", before_state: null, after_state: { title: "산책", start: 780, duration: 30 } }),
      change({ id: "cancelled", time_block_id: "block-cancelled", change_type: "cancelled", before_state: { title: "독서", start: 840, duration: 45 }, after_state: { status: "cancelled" } }),
    ];

    const items = buildChangeGroups(rows, new Map([[PLAN_ID, DATE]]))[0]?.items ?? [];

    expect(items.map((item) => item.effects)).toEqual([["created"], ["cancelled"]]);
  });

  it("서로 다른 변경 이유는 별도 묶음으로 유지한다", () => {
    const rows = [
      change({ reason: "연락이 길어짐" }),
      change({ id: "change-2", time_block_id: "block-2", reason: "우선순위 변경" }),
    ];

    const groups = buildChangeGroups(rows, new Map([[PLAN_ID, DATE]]));

    expect(groups.map((group) => group.reason)).toEqual(["연락이 길어짐", "우선순위 변경"]);
  });
});
