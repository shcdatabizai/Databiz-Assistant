import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeHtmlText } from "@/lib/htmlText";
import { MY_NEWS_SETTINGS_KEY } from "@/lib/myNews";
import { resolvePress } from "@/lib/newsPress";
import { pickUniqueStories } from "@/lib/newsCluster";

const EMPTY_KEYWORDS = "My거래처 뉴스 설정화면에서 수집할 키워드를 먼저 등록해 주세요.";

function parseDate(pubDate: string): string | null {
  const time = Date.parse(pubDate);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(time));
}

export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const dateFrom = typeof body?.dateFrom === "string" ? body.dateFrom : "";
  const dateTo = typeof body?.dateTo === "string" ? body.dateTo : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "수집 기간을 선택해주세요." }, { status: 400 });
  }
  const fromDate = new Date(`${dateFrom}T00:00:00`);
  const toDate = new Date(`${dateTo}T00:00:00`);
  const maxDate = new Date(fromDate);
  maxDate.setMonth(maxDate.getMonth() + 1);
  if (toDate < fromDate || toDate > maxDate) {
    return NextResponse.json({ error: "검색 기간은 시작일부터 최대 한 달입니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("user_news_watch")
    .select("keyword, company_name")
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const terms = (rows ?? [])
    .filter((row) => row.keyword !== MY_NEWS_SETTINGS_KEY)
    .map((row) => (row.keyword || row.company_name || "").trim())
    .filter(Boolean);
  if (terms.length === 0) {
    return NextResponse.json({ error: EMPTY_KEYWORDS }, { status: 400 });
  }

  const clientId = await resolveApiKey("NAVER_CLIENT_ID", user.id);
  const clientSecret = await resolveApiKey("NAVER_CLIENT_SECRET", user.id);
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "네이버 검색 API 키가 등록되어 있지 않습니다." }, { status: 400 });
  }

  const articles: Array<{
    title: string;
    url: string;
    source: string;
    source_tier: string | null;
    date: string;
    summary: string;
    query: string;
  }> = [];
  const seen = new Set<string>();
  for (const term of terms.slice(0, 12)) {
    let reachedOlder = false;
    for (let start = 1; start <= 1000 && !reachedOlder; start += 100) {
      const url = new URL("https://openapi.naver.com/v1/search/news.json");
      url.searchParams.set("query", term);
      url.searchParams.set("display", "100");
      url.searchParams.set("start", String(start));
      url.searchParams.set("sort", "date");
      const response = await fetch(url, {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        return NextResponse.json({ error: "네이버 뉴스 검색에 실패했습니다." }, { status: 502 });
      }
      const items = payload?.items ?? [];
      if (items.length === 0) break;
      for (const item of items) {
        const date = parseDate(item.pubDate || "");
        if (!date) continue;
        if (date < dateFrom) {
          reachedOlder = true;
          break;
        }
        const link = String(item.link || item.originallink || "");
        if (date > dateTo || !link || seen.has(link)) continue;
        seen.add(link);
        const press = resolvePress([String(item.link || ""), String(item.originallink || "")], String(item.source || ""));
        articles.push({
          title: decodeHtmlText(String(item.title || "").replace(/<[^>]+>/g, "")),
          url: link,
          source: press.source,
          source_tier: press.source_tier,
          date,
          summary: decodeHtmlText(String(item.description || "").replace(/<[^>]+>/g, "")),
          query: term,
        });
      }
      if (items.length < 100) break;
    }
  }

  const links = articles.map((article) => article.url);
  const byUrl = new Map<string, { url: string; source: string | null; source_tier: string | null; summary_claude: string | null; summary_snippet: string | null }>();
  for (let index = 0; index < links.length; index += 80) {
    const chunk = links.slice(index, index + 80);
    const { data: known } = await admin
      .from("news_articles")
      .select("url, source, source_tier, summary_claude, summary_snippet")
      .in("url", chunk);
    for (const row of known ?? []) byUrl.set(row.url, row);
  }
  for (const article of articles) {
    const row = byUrl.get(article.url);
    if (!row) continue;
    const press = resolvePress([article.url], row.source || article.source);
    article.source = press.source;
    article.source_tier = row.source_tier && row.source_tier !== "unknown" ? row.source_tier : press.source_tier;
    article.summary = decodeHtmlText(row.summary_claude || row.summary_snippet || article.summary);
  }

  const unique = pickUniqueStories(articles).sort((a, b) => b.date.localeCompare(a.date));
  return NextResponse.json({ articles: unique, terms });
}
