import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const admin = createAdminClient();

  const { data: weeks, error: weeksError } = await admin
    .from("news_weeks")
    .select("week, collected_at, period_from, period_to, total_raw, total_after_dedup, total_final")
    .order("week", { ascending: false });

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 });
  }

  let query = admin
    .from("news_articles")
    .select(
      "id, week, article_date, source, source_tier, title, summary_snippet, summary_claude, keywords, url, score",
      { count: "exact" }
    )
    .order("article_date", { ascending: false })
    .order("score", { ascending: false });

  if (week) query = query.eq("week", week);
  if (q) query = query.ilike("title", `%${q}%`);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: articles, error: articlesError, count } = await query.range(from, to);

  if (articlesError) {
    return NextResponse.json({ error: articlesError.message }, { status: 500 });
  }

  return NextResponse.json({
    weeks: weeks ?? [],
    articles: articles ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}
