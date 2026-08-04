import { describe, expect, it } from "vitest";
import { resolvePlannerDropIntent } from "./drag-drop-intent";

describe("타임블록 드롭 처리", () => {
  it("블록을 시간표 바깥에 놓으면 일정에서 빼도록 판단한다", () => {
    expect(resolvePlannerDropIntent("block", null, null, true)).toEqual({ type: "remove" });
  });

  it("마지막으로 지난 시간 칸이 남아 있어도 현재 위치가 바깥이면 일정에서 뺀다", () => {
    expect(resolvePlannerDropIntent("block", null, 510, true)).toEqual({ type: "remove" });
  });

  it("일정표의 시간 숫자 영역에서는 마지막 드롭 칸을 유지한다", () => {
    expect(resolvePlannerDropIntent("block", null, 510, false)).toEqual({ type: "place", start: 510 });
  });

  it("할 일을 시간표 바깥에 놓으면 아무 작업도 하지 않는다", () => {
    expect(resolvePlannerDropIntent("task", null, null, true)).toEqual({ type: "ignore" });
  });

  it("시간표 안에서는 포인터가 가리킨 15분 위치를 우선한다", () => {
    expect(resolvePlannerDropIntent("block", 555, 540, false)).toEqual({ type: "place", start: 555 });
  });

  it("포인터 위치를 구하지 못하면 드롭 칸의 시간을 사용한다", () => {
    expect(resolvePlannerDropIntent("task", null, 600, false)).toEqual({ type: "place", start: 600 });
  });
});
