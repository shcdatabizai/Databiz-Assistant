"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, Settings } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MailPreviewDialog } from "@/components/news/MailPreviewDialog";
import { buildNewsMailText, type NewsMailArticle } from "@/lib/newsMail";
import type { MyNewsSettings } from "@/lib/myNews";

interface NewsCardItem {
  id: string;
  title: string;
  url: string;
  date: string | null;
  source: string | null;
  source_tier: string | null;
  summary: string;
  tags: string[];
}

interface MatchedArticle {
  id: string;
  article_date: string | null;
  source: string | null;
  source_tier: string | null;
  title: string;
  summary_snippet: string | null;
  summary_claude: string | null;
  url: string;
  matchedTerms: string[];
}

interface SearchedArticle {
  title: string;
  url: string;
  source: string | null;
  source_tier: string | null;
  date: string;
  summary: string;
  query: string;
}

const EMPTY_KEYWORDS = "My거래처 뉴스 설정화면에서 수집할 키워드를 먼저 등록해 주세요.";
const TIER_LABEL: Record<string, string> = {
  tier1: "주요매체",
  tier2: "일반매체",
  tier3: "기타매체",
  unknown: "기타매체",
};

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return isoDate(date);
}

function displayTag(tag: string, watchTerms: string[]) {
  return watchTerms.find((term) => term.toLowerCase() === tag.toLowerCase()) || tag;
}

const PAGE_SIZE = 20;

function pageWindow(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const keep = [1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total);
  return [...new Set(keep)].sort((a, b) => a - b);
}

function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= 1) return null;
  const numbers = pageWindow(page, total);
  const buttonClass = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm text-black/70 hover:bg-black/5 disabled:opacity-40";
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-center gap-1" aria-label="페이지">
      <Button type="button" variant="ghost" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="이전 페이지">
        <ChevronLeft />
      </Button>
      {numbers.map((number, index) => {
        const previous = numbers[index - 1];
        return (
          <span key={number} className="inline-flex items-center gap-1">
            {previous && number - previous > 1 ? <span className="px-1 text-black/35">..</span> : null}
            <button
              type="button"
              className={`${buttonClass} ${number === page ? "bg-[#eef3ff] font-semibold text-[#0046ff]" : ""}`}
              onClick={() => onChange(number)}
              aria-current={number === page ? "page" : undefined}
            >
              {number}
            </button>
          </span>
        );
      })}
      <Button type="button" variant="ghost" size="icon" disabled={page >= total} onClick={() => onChange(page + 1)} aria-label="다음 페이지">
        <ChevronRight />
      </Button>
    </nav>
  );
}

function sortCards(items: NewsCardItem[], newest: boolean) {
  return [...items].sort((a, b) => {
    const compared = (a.date || "").localeCompare(b.date || "");
    return newest ? -compared : compared;
  });
}

function ArticleCards({
  items,
  selected,
  onToggle,
  watchTerms,
}: {
  items: NewsCardItem[];
  selected: string[];
  onToggle: (id: string) => void;
  watchTerms: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((article) => (
        <Card key={article.id} className="transition-shadow hover:shadow-md">
          <div className="flex items-start gap-3 p-4">
            <input
              type="checkbox"
              checked={selected.includes(article.id)}
              onChange={() => onToggle(article.id)}
              aria-label={`${article.title} 선택`}
              className="mt-1 size-4 shrink-0"
            />
            <a href={article.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
              <CardHeader className="p-0">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base leading-snug hover:text-shinhan-blue">{article.title}</CardTitle>
                  <Badge variant="outline">{TIER_LABEL[article.source_tier || ""] || "기타매체"}</Badge>
                </div>
                <CardDescription className="text-xs">
                  {[article.source, article.date].filter(Boolean).join(" · ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-0 pt-3">
                <p className="text-sm leading-relaxed text-black/70">{article.summary}</p>
                <div className="flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs text-[#6b7280]">
                      #{displayTag(tag, watchTerms)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </a>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function MyNewsClient() {
  const [articles, setArticles] = useState<MatchedArticle[]>([]);
  const [settings, setSettings] = useState<MyNewsSettings | null>(null);
  const [watchTerms, setWatchTerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState<SearchedArticle[] | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [collectedPage, setCollectedPage] = useState(1);
  const [newest, setNewest] = useState(true);
  const [groupOpen, setGroupOpen] = useState(false);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [mailMessage, setMailMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mailPreview, setMailPreview] = useState("");
  const [mailArticles, setMailArticles] = useState<NewsMailArticle[]>([]);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/news/my")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setArticles(data.articles ?? []);
        setSettings(data.settings ?? null);
        setWatchTerms(data.watchTerms ?? []);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!groupRef.current?.contains(event.target as Node)) setGroupOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  function changeFrom(value: string) {
    setDateFrom(value);
    setError(null);
    if (!value || !dateTo) return;
    if (dateTo < value) setDateTo(value);
    else if (dateTo > addMonths(value, 1)) setDateTo(addMonths(value, 1));
  }

  function changeTo(value: string) {
    setError(null);
    if (dateFrom && value > addMonths(dateFrom, 1)) {
      setDateTo(addMonths(dateFrom, 1));
      setError("검색 기간은 최대 한 달까지입니다.");
      return;
    }
    setDateTo(value);
  }

  async function searchArticles(event: React.FormEvent) {
    event.preventDefault();
    if (dateFrom && dateTo && (dateTo < dateFrom || dateTo > addMonths(dateFrom, 1))) {
      setError("검색 기간은 최대 한 달까지입니다.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/news/my/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "검색 실패");
      setSearched(body.articles ?? []);
      setSearchPage(1);
      setSelected([]);
    } catch (e) {
      setSearched(null);
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function toggleTag(tag: string) {
    setPickedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
    setSearchPage(1);
    setCollectedPage(1);
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setMailMessage(null);
  }

  const collected: NewsCardItem[] = articles.map((article) => ({
    id: article.id,
    title: article.title,
    url: article.url,
    date: article.article_date,
    source: article.source,
    source_tier: article.source_tier,
    summary: article.summary_claude || article.summary_snippet || "",
    tags: article.matchedTerms,
  }));
  const searchCards: NewsCardItem[] = (searched ?? []).map((article) => ({
    id: article.url,
    title: article.title,
    url: article.url,
    date: article.date,
    source: article.source,
    source_tier: article.source_tier,
    summary: article.summary,
    tags: article.query ? [article.query] : [],
  }));
  const allCards = [...searchCards, ...collected];

  function listed(items: NewsCardItem[]) {
    const sorted = sortCards(items, newest);
    if (pickedTags.length === 0) return sorted;
    const tags = new Set(pickedTags.map((tag) => tag.toLowerCase()));
    return sorted.filter((item) => item.tags.some((tag) => tags.has(tag.toLowerCase())));
  }

  const searchList = listed(searchCards);
  const collectedList = listed(collected);
  const searchPageCount = Math.max(1, Math.ceil(searchList.length / PAGE_SIZE));
  const collectedPageCount = Math.max(1, Math.ceil(collectedList.length / PAGE_SIZE));
  const searchSafe = Math.min(searchPage, searchPageCount);
  const collectedSafe = Math.min(collectedPage, collectedPageCount);
  const searchSlice = searchList.slice((searchSafe - 1) * PAGE_SIZE, searchSafe * PAGE_SIZE);
  const collectedSlice = collectedList.slice((collectedSafe - 1) * PAGE_SIZE, collectedSafe * PAGE_SIZE);

  function grouped(items: NewsCardItem[]) {
    const sorted = sortCards(items, newest);
    if (pickedTags.length === 0) return [{ tag: "", items: sorted }];
    return pickedTags
      .map((tag) => ({
        tag,
        items: sorted.filter((item) => item.tags.some((value) => value.toLowerCase() === tag.toLowerCase())),
      }))
      .filter((group) => group.items.length > 0);
  }

  function openMailPreview() {
    const picked = allCards
      .filter((article) => selected.includes(article.id))
      .map((article) => ({
        title: article.title,
        url: article.url,
        source: article.source,
        summary: article.summary,
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

  const showCollected = !!settings?.autoCollect && articles.length > 0;
  const endMax = dateFrom ? addMonths(dateFrom, 1) : undefined;

  function renderGroups(items: NewsCardItem[]) {
    const groups = grouped(items);
    if (pickedTags.length > 0 && groups.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-sm text-black/50">선택한 태그에 해당하는 기사가 없습니다.</CardContent>
        </Card>
      );
    }
    if (pickedTags.length === 0) {
      return <ArticleCards items={groups[0]?.items ?? []} selected={selected} onToggle={toggle} watchTerms={watchTerms} />;
    }
    return (
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.tag}>
            <h3 className="mb-2 text-sm font-semibold text-black/60">#{group.tag}</h3>
            <ArticleCards items={group.items} selected={selected} onToggle={toggle} watchTerms={watchTerms} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">My거래처 뉴스 알림</h1>
        <p className="mt-1 text-sm text-black/55">등록한 키워드로 거래처 뉴스를 검색합니다.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">기사 검색</CardTitle>
          <CardDescription>설정에 등록된 키워드로 기사를 검색합니다.</CardDescription>
          <CardAction>
            <Link
              href="/my-news/settings"
              aria-label="설정"
              title="설정"
              className="inline-flex size-11 items-center justify-center text-black/70 hover:text-shinhan-blue"
            >
              <Settings className="size-7" strokeWidth={1.75} />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-[0.8125rem] font-semibold">
            조회기간 <span className="font-normal text-black/35">(최대 1달)</span>
          </p>
          <form onSubmit={searchArticles} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
            <input
              type="date"
              required
              value={dateFrom}
              onChange={(event) => changeFrom(event.target.value)}
              className="box-border h-11 min-h-11 w-full min-w-0 rounded-md border border-[#ebe9f1] bg-white px-2.5 text-sm"
            />
            <span className="text-[#8b8b94]">~</span>
            <input
              type="date"
              required
              value={dateTo}
              min={dateFrom || undefined}
              max={endMax}
              onChange={(event) => changeTo(event.target.value)}
              className="box-border h-11 min-h-11 w-full min-w-0 rounded-md border border-[#ebe9f1] bg-white px-2.5 text-sm"
            />
            <Button type="submit" className="h-11 px-3" disabled={searching}>
              {searching ? "검색 중..." : "기사검색"}
            </Button>
          </form>
          {watchTerms.length === 0 ? <p className="mt-3 text-sm text-amber-700">{EMPTY_KEYWORDS}</p> : null}
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => {
            setNewest((value) => !value);
            setSearchPage(1);
            setCollectedPage(1);
          }}
          className="h-10 rounded-lg px-3 text-sm font-medium text-black/70 hover:bg-black/5"
        >
          {newest ? "최신순" : "과거순"}
        </button>
        <div className="relative" ref={groupRef}>
          <button
            type="button"
            aria-label="태그별로 모아보기"
            aria-expanded={groupOpen}
            onClick={() => setGroupOpen((value) => !value)}
            className="inline-flex size-10 items-center justify-center rounded-lg text-black/70 hover:bg-black/5 hover:text-shinhan-blue"
          >
            <LayoutGrid className="size-5" />
          </button>
          {groupOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-black/10 bg-white p-3 shadow-lg">
              <p className="mb-2 text-xs font-medium text-black/45">태그별로 모아보기</p>
              {watchTerms.length === 0 ? (
                <p className="text-xs text-black/45">등록된 태그가 없습니다.</p>
              ) : (
                watchTerms.map((tag) => (
                  <label key={tag} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={pickedTags.includes(tag)} onChange={() => toggleTag(tag)} />
                    {tag}
                  </label>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-3 sm:flex-row sm:items-center">
          <p className="text-sm font-medium">{selected.length}건 선택</p>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="받을 메일 주소"
            className="h-10 sm:max-w-xs"
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
      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}

      {searched ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">검색 결과 {searchList.length}건</h2>
          {searchList.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-black/50">이 기간에 걸린 기사가 없습니다.</CardContent>
            </Card>
          ) : (
            <>
              {renderGroups(searchSlice)}
              <Pager page={searchSafe} total={searchPageCount} onChange={setSearchPage} />
            </>
          )}
        </section>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold">최근 수집 기사</h2>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : showCollected ? (
        <>
          {renderGroups(collectedSlice)}
          <Pager page={collectedSafe} total={collectedPageCount} onChange={setCollectedPage} />
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-black/50">
            {watchTerms.length === 0
              ? EMPTY_KEYWORDS
              : settings?.autoCollect
                ? "자동 수집은 켜져 있지만, 아직 맞춰진 최근 기사가 없습니다."
                : "자동 수집이 꺼져 있습니다. 설정에서 켜면 최근 기사를 여기에 모읍니다."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
