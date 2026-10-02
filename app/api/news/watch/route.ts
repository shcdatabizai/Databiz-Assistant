import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MY_NEWS_SETTINGS_KEY, parseMyNewsSettings, splitWatchTerms } from "@/lib/myNews";

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

  const rows = data ?? [];
  const settingsRow = rows.find((row) => row.keyword === MY_NEWS_SETTINGS_KEY);
  const items = rows.filter((row) => row.keyword !== MY_NEWS_SETTINGS_KEY);
  const terms = items
    .map((row) => row.keyword || row.company_name || "")
    .filter(Boolean);

  return NextResponse.json({
    items,
    terms,
    settings: parseMyNewsSettings(settingsRow?.company_name),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  if (body && (typeof body.keywordsText === "string" || body.settings)) {
    if (typeof body.keywordsText === "string") {
      const terms = splitWatchTerms(body.keywordsText);
      const { error: deleteError } = await admin
        .from("user_news_watch")
        .delete()
        .eq("user_id", user.id)
        .or(`keyword.is.null,keyword.neq.${MY_NEWS_SETTINGS_KEY}`);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      if (terms.length > 0) {
        const { error: insertError } = await admin.from("user_news_watch").insert(
          terms.map((keyword) => ({ user_id: user.id, keyword, company_name: null }))
        );
        if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    if (body.settings) {
      const settings = parseMyNewsSettings(JSON.stringify(body.settings));
      const { data: existing } = await admin
        .from("user_news_watch")
        .select("id")
        .eq("user_id", user.id)
        .eq("keyword", MY_NEWS_SETTINGS_KEY)
        .maybeSingle();
      const payload = { company_name: JSON.stringify(settings) };
      const { error } = existing
        ? await admin.from("user_news_watch").update(payload).eq("id", existing.id)
        : await admin.from("user_news_watch").insert({
            user_id: user.id,
            keyword: MY_NEWS_SETTINGS_KEY,
            ...payload,
          });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : "";
  if (!keyword && !companyName) {
    return NextResponse.json({ error: "키워드 또는 업체명을 입력해주세요." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("user_news_watch")
    .insert({
      user_id: user.id,
      keyword: keyword || null,
      company_name: companyName || null,
    })
    .select("id, keyword, company_name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
