import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  if (!watchItems || watchItems.length === 0) {
    return NextResponse.json({ articles: [], watchCount: 0 });
  }

  const terms = watchItems
    .flatMap((w) => [w.keyword, w.company_name])
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

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
      return matchedTerms.length > 0 ? { ...article, matchedTerms } : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  return NextResponse.json({ articles: matched, watchCount: watchItems.length });
}
