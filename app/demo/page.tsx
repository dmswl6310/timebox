import { TimeboxDashboard } from "@/features/planner/timebox-dashboard";
import { demoSeed } from "@/features/planner/store";
import { dateInTimeZone, koreanDateLabel } from "@/lib/date";

export const metadata = {
  title: "데모 — Timebox",
};

function demoDateLabel() {
  return koreanDateLabel(dateInTimeZone());
}

export default function DemoPage() {
  return (
    <TimeboxDashboard
      todayLabel={demoDateLabel()}
      seed={demoSeed}
    />
  );
}
