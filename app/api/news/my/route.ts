import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeHtmlText } from "@/lib/htmlText";
import { MY_NEWS_SETTINGS_KEY, parseMyNewsSettings } from "@/lib/myNews";
import { resolvePress } from "@/lib/newsPress";

const RECENT_ARTICLE_LIMIT = 300;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: watchItems, error: watchError } = await admin
    .from("user_news_watch")
    .select("id, keyword, company_name")
    .eq("user_id", user.id);

  if (watchError) {
    return NextResponse.json({ error: watchError.message }, { status: 500 });
  }

  const settingsRow = (watchItems ?? []).find((row) => row.keyword === MY_NEWS_SETTINGS_KEY);
  const settings = parseMyNewsSettings(settingsRow?.company_name);
  const watchTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const row of watchItems ?? []) {
    if (row.keyword === MY_NEWS_SETTINGS_KEY) continue;
    const label = (row.keyword || row.company_name || "").trim();
    const key = label.toLowerCase();
    if (!label || seenTerms.has(key)) continue;
    seenTerms.add(key);
    watchTerms.push(label);
  }
  const terms = watchTerms.map((term) => term.toLowerCase());

  if (terms.length === 0) {
    return NextResponse.json({ articles: [], watchCount: 0, watchTerms, settings });
  }

  const { data: articles, error: articlesError } = await admin
    .from("news_articles")
    .select("id, week, article_date, source, source_tier, title, summary_snippet, summary_claude, keywords, url, score")
    .order("article_date", { ascending: false })
    .limit(RECENT_ARTICLE_LIMIT);

  if (articlesError) {
    return NextResponse.json({ error: articlesError.message }, { status: 500 });
  }

  const matched = (articles ?? [])
    .map((article) => {
      const haystack = [article.title, ...(article.keywords ?? [])].join(" ").toLowerCase();
      const matchedTerms = terms.filter((t) => haystack.includes(t));
      if (matchedTerms.length === 0) return null;
      const press = resolvePress([article.url || ""], article.source || "");
      return {
        ...article,
        title: decodeHtmlText(article.title),
        source: press.source || article.source,
        source_tier: article.source_tier && article.source_tier !== "unknown" ? article.source_tier : press.source_tier,
        summary_snippet: decodeHtmlText(article.summary_snippet),
        summary_claude: decodeHtmlText(article.summary_claude),
        matchedTerms,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return NextResponse.json({
    articles: matched,
    watchCount: terms.length,
    watchTerms,
    settings,
  });
}
