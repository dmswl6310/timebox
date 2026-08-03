import { redirect } from "next/navigation";
import { TimeboxDashboard } from "@/features/planner/timebox-dashboard";
import { getPlannerSeed } from "@/features/planner/server-data";
import { dateInTimeZone, isIsoDate, koreanDateLabel } from "@/lib/date";

export const dynamic = "force-dynamic";

function todayInSeoul() {
  return dateInTimeZone();
}

function validPlanDate(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isIsoDate(candidate) ? candidate : todayInSeoul();
}

type HomeProps = { searchParams: Promise<{ date?: string | string[] }> };

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const planDate = validPlanDate(params.date);
  const seed = await getPlannerSeed(planDate);
  if (!seed) redirect("/login");

  return (
    <TimeboxDashboard
      todayLabel={koreanDateLabel(planDate)}
      seed={seed}
    />
  );
}
