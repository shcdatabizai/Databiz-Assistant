"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface NewsWeek {
  week: string;
  collected_at: string | null;
  period_from: string | null;
  period_to: string | null;
  total_final: number | null;
}

interface NewsArticle {
  id: string;
  week: string | null;
  article_date: string | null;
  source: string | null;
  source_tier: "tier1" | "tier2" | "tier3" | "unknown" | null;
  title: string;
  summary_snippet: string | null;
  summary_claude: string | null;
  keywords: string[] | null;
  url: string;
  score: number | null;
}

const TIER_LABEL: Record<string, string> = {
  tier1: "주요매체",
  tier2: "일반매체",
  tier3: "기타매체",
  unknown: "미분류",
};

export default function DataNewsPage() {
  const [weeks, setWeeks] = useState<NewsWeek[]>([]);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<string>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (week !== "all") params.set("week", week);
    if (q.trim()) params.set("q", q.trim());

    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
      })
      .then(() => fetch(`/api/news?${params.toString()}`))
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setWeeks(data.weeks ?? []);
        setArticles(data.articles ?? []);
      })
      .catch(() => setError("뉴스 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [week, q]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">데이터 관련 뉴스수집</h1>
        <p className="mt-1 text-sm text-black/55">
          신한카드 데이터 관련 뉴스를 매주 자동 수집하고 요약해 보여줍니다.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="제목으로 검색"
            className="pl-9"
          />
        </div>
        <Select value={week} onValueChange={(value) => setWeek(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="전체 주차" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 주차</SelectItem>
            {weeks.map((w) => (
              <SelectItem key={w.week} value={w.week}>
                {w.week} ({w.total_final ?? 0}건)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Card className="mb-4 border-red-200">
          <CardContent className="py-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-black/50">
            {weeks.length === 0
              ? "아직 수집된 뉴스가 없습니다. 관리자 페이지에서 첫 수집을 실행해주세요."
              : "조건에 맞는 뉴스가 없습니다."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {articles.map((a) => (
            <Card key={a.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base leading-snug">
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-shinhan-blue">
                      {a.title}
                    </a>
                  </CardTitle>
                  {a.source_tier && <Badge variant="outline">{TIER_LABEL[a.source_tier]}</Badge>}
                </div>
                <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                  {a.source && <span>{a.source}</span>}
                  {a.article_date && <span>· {a.article_date}</span>}
                  {typeof a.score === "number" && <span>· 관련도 {a.score}점</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed text-black/70">
                  {a.summary_claude || a.summary_snippet || ""}
                </p>
                {a.keywords && a.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {a.keywords.map((k) => (
                      <Badge key={k} variant="secondary">
                        {k}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
