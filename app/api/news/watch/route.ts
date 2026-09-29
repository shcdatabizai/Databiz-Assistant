import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_news_watch")
    .select("id, keyword, company_name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";

  if (!keyword && !companyName) {
    return NextResponse.json({ error: "키워드 또는 업체명을 입력해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_news_watch")
    .insert({
      user_id: user.id,
      keyword: keyword || null,
      company_name: companyName || null,
    })
    .select("id, keyword, company_name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
