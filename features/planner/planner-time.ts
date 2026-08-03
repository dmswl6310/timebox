export const PLAN_END_HOUR = 25;
export const PLAN_END_MINUTES = PLAN_END_HOUR * 60;

const DAY_MINUTES = 24 * 60;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export function planMinuteToIso(planDate: string, minutes: number) {
  const seoulMidnight = new Date(`${planDate}T00:00:00+09:00`);
  return new Date(seoulMidnight.getTime() + minutes * 60_000).toISOString();
}

export function minutesInPlanDay(iso: string, timezone: string, planDate: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  const localDate = `${value("year")}-${value("month")}-${value("day")}`;
  const dayOffset = Math.round((Date.parse(`${localDate}T00:00:00Z`) - Date.parse(`${planDate}T00:00:00Z`)) / DAY_MILLISECONDS);
  const hour = Number(value("hour")) % 24;
  const minute = Number(value("minute"));
  return dayOffset * DAY_MINUTES + hour * 60 + minute;
}

export function formatPlanTime(totalMinutes: number) {
  const normalized = ((totalMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
