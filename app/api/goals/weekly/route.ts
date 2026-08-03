import { NextResponse } from "next/server";
import { isIsoDate, startOfIsoWeek } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type GoalBody = { weekStart?: string; targetMinutes?: number };

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  return { supabase, userId: claimsError ? undefined : userId };
}

function validWeekStart(value: string | null | undefined) {
  return Boolean(value && isIsoDate(value) && startOfIsoWeek(value) === value);
}

export async function GET(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const weekStart = new URL(request.url).searchParams.get("weekStart");
  if (!validWeekStart(weekStart)) return NextResponse.json({ error: "올바른 주 시작일이 필요해요." }, { status: 400 });

  const { data, error } = await supabase
    .from("weekly_goals")
    .select("week_start,target_minutes,updated_at")
    .eq("user_id", userId)
    .eq("week_start", weekStart as string)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "주간 목표를 불러오지 못했어요." }, { status: 500 });
  return NextResponse.json({ goal: data ? { weekStart: data.week_start, targetMinutes: data.target_minutes, updatedAt: data.updated_at } : null }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  let body: GoalBody;
  try {
    body = await request.json() as GoalBody;
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  const targetMinutes = Number(body.targetMinutes);
  if (!validWeekStart(body.weekStart) || !Number.isInteger(targetMinutes) || targetMinutes < 60 || targetMinutes > 10080 || targetMinutes % 30 !== 0) {
    return NextResponse.json({ error: "목표 시간은 1시간부터 168시간까지 30분 단위로 설정해 주세요." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("weekly_goals")
    .upsert({ user_id: userId, week_start: body.weekStart as string, target_minutes: targetMinutes }, { onConflict: "user_id,week_start" })
    .select("week_start,target_minutes,updated_at")
    .single();
  if (error) return NextResponse.json({ error: "주간 목표를 저장하지 못했어요." }, { status: 500 });
  return NextResponse.json({ goal: { weekStart: data.week_start, targetMinutes: data.target_minutes, updatedAt: data.updated_at } }, { headers: { "cache-control": "no-store" } });
}
