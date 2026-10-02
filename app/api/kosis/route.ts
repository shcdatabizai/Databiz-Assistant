import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kosis_shc_monthly")
    .select("year_month, total_index, kosis_total, kosis_medicine, shc_total, shc_medical, updated_at")
    .order("year_month", { ascending: false })
    .limit(36);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}
