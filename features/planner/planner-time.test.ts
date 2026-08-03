import { describe, expect, it } from "vitest";
import { formatPlanTime, minutesInPlanDay, PLAN_END_MINUTES, planMinuteToIso } from "./planner-time";

describe("자정 이후 계획 시간", () => {
  it("계획일의 24시 30분을 다음 날짜 ISO 시각으로 저장한다", () => {
    expect(planMinuteToIso("2026-08-04", 24 * 60 + 30)).toBe("2026-08-04T15:30:00.000Z");
  });

  it("다음 날 00시 30분을 원래 계획일의 24시 30분으로 복원한다", () => {
    expect(minutesInPlanDay("2026-08-04T15:30:00.000Z", "Asia/Seoul", "2026-08-04")).toBe(24 * 60 + 30);
  });

  it("시간표 끝과 자정 이후 시각을 사용자에게 익숙한 시계 형식으로 표시한다", () => {
    expect(PLAN_END_MINUTES).toBe(25 * 60);
    expect(formatPlanTime(24 * 60 + 30)).toBe("00:30");
    expect(formatPlanTime(25 * 60)).toBe("01:00");
  });
});
