import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("schedule_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id,revoked_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "공유를 취소하지 못했어요." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "활성 공유 링크를 찾지 못했어요." }, { status: 404 });

  return NextResponse.json({ id: data.id, revokedAt: data.revoked_at }, { headers: { "cache-control": "no-store" } });
}
