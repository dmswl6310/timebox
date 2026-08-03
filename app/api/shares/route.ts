import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ShareRequest = { dailyPlanId?: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
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
    .select("id")
    .eq("id", body.dailyPlanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (planError || !plan) {
    return NextResponse.json({ error: "공유할 일정을 찾지 못했어요." }, { status: 404 });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from("schedule_shares").insert({
    user_id: userId,
    daily_plan_id: plan.id,
    token_hash: `\\x${tokenHash}`,
    include_task_details: true,
    expires_at: expiresAt,
  });
  if (insertError) {
    return NextResponse.json({ error: "공유 링크를 저장하지 못했어요." }, { status: 500 });
  }

  return NextResponse.json(
    { path: `/share/${token}`, expiresAt },
    { headers: { "cache-control": "no-store" } },
  );
}
