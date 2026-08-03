import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ShareRequest = { dailyPlanId?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  return { supabase, userId: claimsError ? undefined : userId };
}

export async function GET() {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { data, error } = await supabase
    .from("schedule_shares")
    .select("id,daily_plan_id,expires_at,revoked_at,created_at,daily_plans(plan_date)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "공유 링크 목록을 불러오지 못했어요." }, { status: 500 });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    daily_plan_id: string;
    expires_at: string | null;
    revoked_at: string | null;
    created_at: string;
    daily_plans: { plan_date: string } | null;
  }>;
  return NextResponse.json({
    shares: rows.map((share) => ({
      id: share.id,
      dailyPlanId: share.daily_plan_id,
      planDate: share.daily_plans?.plan_date ?? "",
      expiresAt: share.expires_at,
      revokedAt: share.revoked_at,
      createdAt: share.created_at,
    })),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const { supabase, userId } = await authenticatedClient();
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  let body: ShareRequest;
  try {
    body = await request.json() as ShareRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  if (!body.dailyPlanId) {
    return NextResponse.json({ error: "공유할 일정이 없어요." }, { status: 400 });
  }

  const { data: plan, error: planError } = await supabase
    .from("daily_plans")
    .select("id,plan_date")
    .eq("id", body.dailyPlanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (planError || !plan) {
    return NextResponse.json({ error: "공유할 일정을 찾지 못했어요." }, { status: 404 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: createdShare, error: insertError } = await supabase
    .from("schedule_shares")
    .insert({
      user_id: userId,
      daily_plan_id: plan.id,
      token_hash: `\\x${tokenHash}`,
      include_task_details: true,
      expires_at: expiresAt,
    })
    .select("id,created_at")
    .single();
  if (insertError) {
    return NextResponse.json({ error: "공유 링크를 저장하지 못했어요." }, { status: 500 });
  }

  return NextResponse.json(
    { path: `/share/${token}`, id: createdShare.id, planDate: plan.plan_date, expiresAt, createdAt: createdShare.created_at },
    { headers: { "cache-control": "no-store" } },
  );
}
