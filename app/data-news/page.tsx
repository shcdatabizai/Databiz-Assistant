"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MailPreviewDialog } from "@/components/news/MailPreviewDialog";
import { buildNewsMailText, type NewsMailArticle } from "@/lib/newsMail";

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
  search_query: string | null;
  url: string;
  score: number | null;
}

const TIER_LABEL: Record<string, string> = {
  tier1: "주요매체",
  tier2: "일반매체",
  tier3: "기타매체",
  unknown: "기타매체",
};

function monthDay(iso: string) {
  const [, month, day] = iso.slice(0, 10).split("-");
  if (!month || !day) return iso;
  return `${Number(month)}/${Number(day)}`;
}

function formatWeek(week: NewsWeek) {
  const match = week.week.match(/^(\d{4})-W(\d{1,2})$/);
  const range =
    week.period_from && week.period_to ? ` (${monthDay(week.period_from)}~${monthDay(week.period_to)})` : "";
  if (!match) return `${week.week}${range}`;
  return `${match[1]}년 ${Number(match[2])}주차${range}`;
}

export default function DataNewsPage() {
  const [weeks, setWeeks] = useState<NewsWeek[]>([]);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [mailMessage, setMailMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mailPreview, setMailPreview] = useState("");
  const [mailArticles, setMailArticles] = useState<NewsMailArticle[]>([]);

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

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setMailMessage(null);
  }

  function openMailPreview() {
    const picked = articles
      .filter((article) => selected.includes(article.id))
      .map((article) => ({
        title: article.title,
        url: article.url,
        source: article.source,
        summary: article.summary_claude || article.summary_snippet || "",
      }));
    setMailArticles(picked);
    setMailPreview(buildNewsMailText(picked));
    setPreviewOpen(true);
  }

  async function sendMail() {
    setSending(true);
    setMailMessage(null);
    try {
      const res = await fetch("/api/news/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, articles: mailArticles, text: mailPreview }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "발송 실패");
      setMailMessage({ text: body.message ?? "메일을 보냈습니다.", ok: true });
      setSelected([]);
      setPreviewOpen(false);
    } catch (e) {
      setMailMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSending(false);
    }
  }

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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목으로 검색" className="pl-9" />
        </div>
        <Select value={week} onValueChange={(value) => setWeek(value ?? "all")}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="전체 주차" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 주차</SelectItem>
            {weeks.map((item) => (
              <SelectItem key={item.week} value={item.week}>
                {formatWeek(item)} ({item.total_final ?? 0}건)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-3 sm:flex-row sm:items-center">
          <p className="text-sm font-medium">{selected.length}건 선택</p>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="받을 메일 주소"
            className="sm:max-w-xs"
          />
          <Button type="button" className="h-10" disabled={!email.includes("@")} onClick={openMailPreview}>
            메일 발송
          </Button>
        </div>
      ) : null}
      <MailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        email={email}
        value={mailPreview}
        onChange={setMailPreview}
        sending={sending}
        error={mailMessage && !mailMessage.ok ? mailMessage.text : null}
        onSend={() => void sendMail()}
      />
      {mailMessage ? (
        <p className={`mb-4 text-sm ${mailMessage.ok ? "text-emerald-600" : "text-red-500"}`}>{mailMessage.text}</p>
      ) : null}

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
          {articles.map((article) => (
            <Card key={article.id} className="transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3 p-4">
                <input
                  type="checkbox"
                  checked={selected.includes(article.id)}
                  onChange={() => toggle(article.id)}
                  aria-label={`${article.title} 선택`}
                  className="mt-1 size-4 shrink-0"
                />
                <a href={article.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <CardHeader className="p-0">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base leading-snug hover:text-shinhan-blue">{article.title}</CardTitle>
                      {article.source_tier ? <Badge variant="outline">{TIER_LABEL[article.source_tier]}</Badge> : null}
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                      {article.source ? <span>{article.source}</span> : null}
                      {article.article_date ? <span>· {article.article_date}</span> : null}
                      {typeof article.score === "number" ? <span>· 관련도 {article.score}점</span> : null}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 p-0 pt-3">
                    <p className="text-sm leading-relaxed text-black/70">
                      {article.summary_claude || article.summary_snippet || ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {article.search_query ? (
                        <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs text-[#6b7280]">
                          #{article.search_query}
                        </span>
                      ) : null}
                      {(article.keywords ?? []).map((keyword) => (
                        <Badge key={keyword} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
