export type PlannerDropIntent =
  | { type: "place"; start: number }
  | { type: "remove" }
  | { type: "ignore" };

export function resolvePlannerDropIntent(
  kind: unknown,
  pointerStart: number | null,
  targetStart: number | null,
  outsideTimetable: boolean,
): PlannerDropIntent {
  if (kind === "block" && outsideTimetable) {
    return { type: "remove" };
  }

  const start = pointerStart ?? targetStart;
  if (start === null || !Number.isFinite(start)) return { type: "ignore" };

  return { type: "place", start };
}
