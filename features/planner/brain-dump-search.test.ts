import { describe, expect, it } from "vitest";
import { filterBrainDumpTasks, normalizeBrainDumpQuery } from "./brain-dump-search";
import type { Task } from "./types";

const tasks: Task[] = [
  { id: "1", title: "면접 답변 정리", estimate: 60, tag: "취업 준비", color: "blue", energy: "보통", isMit: true, completed: false },
  { id: "2", title: "세탁기 돌리기", estimate: 30, tag: "일상", color: "green", energy: "낮음", isMit: false, completed: false },
  { id: "3", title: "PORTFOLIO 문구 수정", estimate: 30, tag: "자소서", color: "violet", energy: "높음", isMit: false, completed: false },
  { id: "4", title: "완료한 면접 준비", estimate: 15, tag: "취업 준비", color: "slate", energy: "낮음", isMit: false, completed: true },
];

describe("브레인덤프 검색", () => {
  it("검색어의 앞뒤·연속 공백과 영문 대소문자를 정규화한다", () => {
    expect(normalizeBrainDumpQuery("  PORTFOLIO   문구 ")).toBe("portfolio 문구");
  });

  it("할 일 제목으로 검색한다", () => {
    expect(filterBrainDumpTasks(tasks, "세탁기").map((task) => task.id)).toEqual(["2"]);
  });

  it("태그로 검색한다", () => {
    expect(filterBrainDumpTasks(tasks, "취업 준비").map((task) => task.id)).toEqual(["1"]);
  });

  it("여러 검색어를 제목과 태그에 걸쳐 모두 확인한다", () => {
    expect(filterBrainDumpTasks(tasks, "면접 취업").map((task) => task.id)).toEqual(["1"]);
  });

  it("완료한 작업은 검색 결과에서 제외한다", () => {
    expect(filterBrainDumpTasks(tasks, "완료한")).toEqual([]);
  });
});
