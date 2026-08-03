export const SEOUL_TIMEZONE = "Asia/Seoul";

export function dateInTimeZone(timeZone = SEOUL_TIMEZONE, value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfIsoWeek(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return shiftIsoDate(value, -mondayOffset);
}

export function koreanDateLabel(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00Z`));
}
