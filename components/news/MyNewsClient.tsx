"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface WatchItem {
  id: number;
  keyword: string | null;
  company_name: string | null;
  created_at: string;
}

interface MatchedArticle {
  id: string;
  article_date: string | null;
  source: string | null;
  title: string;
  summary_snippet: string | null;
  summary_claude: string | null;
  keywords: string[] | null;
  url: string;
  score: number | null;
  matchedTerms: string[];
}

export default function MyNewsClient() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [articles, setArticles] = useState<MatchedArticle[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    Promise.resolve()
      .then(() => setLoadingItems(true))
      .then(() => fetch("/api/news/watch"))
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setError("등록된 키워드를 불러오지 못했습니다."))
      .finally(() => setLoadingItems(false));
  }, [reloadTick]);

  useEffect(() => {
    Promise.resolve()
      .then(() => setLoadingArticles(true))
      .then(() => fetch("/api/news/my"))
      .then((r) => r.json())
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => setError("관련 뉴스를 불러오지 못했습니다."))
      .finally(() => setLoadingArticles(false));
  }, [reloadTick]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() && !companyName.trim()) return;

    setAdding(true);
    setError(null);
    fetch("/api/news/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: keyword.trim(), company_name: companyName.trim() }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setKeyword("");
        setCompanyName("");
        setReloadTick((t) => t + 1);
      })
      .catch(() => setError("등록에 실패했습니다."))
      .finally(() => setAdding(false));
  }

  function handleDelete(id: number) {
    fetch(`/api/news/watch/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then(() => setReloadTick((t) => t + 1))
      .catch(() => setError("삭제에 실패했습니다."));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">My거래처 뉴스 알림</h1>
        <p className="mt-1 text-sm text-black/55">
          관심 키워드·업체명을 등록하면 매주 수집되는 데이터뉴스 중 관련된 기사만 모아 보여드립니다.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">관심 키워드 / 업체명 등록</CardTitle>
          <CardDescription>키워드나 업체명 중 하나만 입력해도 됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="키워드 (예: 소비트렌드)"
              className="flex-1"
            />
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="업체명 (예: OO기업)"
              className="flex-1"
            />
            <Button type="submit" disabled={adding} className="gap-1.5">
              <Plus className="size-4" />
              추가
            </Button>
          </form>

          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {loadingItems ? (
              <Skeleton className="h-7 w-40 rounded-full" />
            ) : items.length === 0 ? (
              <p className="text-sm text-black/40">등록된 키워드가 없습니다.</p>
            ) : (
              items.map((item) => (
                <Badge key={item.id} variant="secondary" className="gap-1.5 py-1.5 pr-1.5">
                  {item.keyword || item.company_name}
                  <button
                    type="button"
                    aria-label="삭제"
                    onClick={() => handleDelete(item.id)}
                    className="rounded-full p-0.5 hover:bg-black/10"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">매칭된 뉴스</h2>
      </div>

      {loadingArticles ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-black/50">
            {items.length === 0
              ? "키워드를 등록하면 관련 뉴스가 여기에 모여요."
              : "아직 매칭된 뉴스가 없습니다."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {articles.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle className="text-base leading-snug">
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:text-shinhan-blue">
                    {a.title}
                  </a>
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                  {a.source && <span>{a.source}</span>}
                  {a.article_date && <span>· {a.article_date}</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm leading-relaxed text-black/70">
                  {a.summary_claude || a.summary_snippet || ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.matchedTerms.map((t) => (
                    <Badge key={t} variant="default">
                      {t}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
