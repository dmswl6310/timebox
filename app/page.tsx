import { TimeboxDashboard } from "@/features/planner/timebox-dashboard";

function getSeoulDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    label: `${value("month")} ${value("day")}${value("weekday") ? ` · ${value("weekday")}` : ""}`,
    minutes: Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(now)
        .split(":")
        .reduce((total, part, index) =>
          index === 0 ? Number(part) * 60 : total + Number(part), 0),
    ),
  };
}

export default function Home() {
  const today = getSeoulDate();

  return <TimeboxDashboard todayLabel={today.label} currentMinutes={today.minutes} />;
}
