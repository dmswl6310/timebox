import { TimeboxDashboard } from "@/features/planner/timebox-dashboard";
import { demoSeed } from "@/features/planner/store";

export const metadata = {
  title: "데모 — Timebox",
};

function nowInSeoul() {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value ?? "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now).split(":");
  return {
    label: `${value("month")} ${value("day")} · ${value("weekday")}`,
    minutes: (Number(time[0]) % 24) * 60 + Number(time[1]),
  };
}

export default function DemoPage() {
  const today = nowInSeoul();
  return (
    <TimeboxDashboard
      todayLabel={today.label}
      currentMinutes={today.minutes}
      seed={demoSeed}
    />
  );
}
