"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NEWS_GITHUB_KEY_DEFS } from "@/lib/apiKeyDefs";
import type { CollectInterval, EmailInterval, NewsCrawlSettings } from "@/lib/newsSettings";

interface GithubKeyRow {
  key: string;
  label: string;
  placeholder: string;
  hasValue: boolean;
  masked: string | null;
}

const COLLECT_OPTIONS: { value: CollectInterval; label: string }[] = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주 (월요일)" },
  { value: "monthly", label: "매월 1일" },
];

interface CrawlRun {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
}

const ACTIVE_STATUSES = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

function describeRun(run: CrawlRun | null, watchFrom: number | null): { text: string; ok: boolean; active: boolean } {
  const waiting = { text: "실행을 요청했습니다. 시작을 확인하는 중입니다.", ok: true, active: true };
  if (!run) return watchFrom ? waiting : { text: "최근 수집 실행 기록이 없습니다.", ok: true, active: false };
  if (ACTIVE_STATUSES.has(run.status)) return { text: "수집이 진행 중입니다.", ok: true, active: true };
  const created = new Date(run.createdAt).getTime();
  if (watchFrom !== null && created < watchFrom - 20000) return waiting;
  const when = new Date(run.createdAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (run.conclusion === "success") return { text: `${when} 수집이 완료되었습니다.`, ok: true, active: false };
  if (run.conclusion === "failure") {
    return { text: `${when} 수집이 실패했습니다. 실행 기록에서 원인을 확인할 수 있습니다.`, ok: false, active: false };
  }
  if (run.conclusion === "cancelled") return { text: `${when} 수집이 취소되었습니다.`, ok: false, active: false };
  return { text: "최근 수집 상태를 확인했습니다.", ok: true, active: false };
}

const EMAIL_OPTIONS: { value: EmailInterval; label: string }[] = [
  { value: "off", label: "사용 안 함" },
  { value: "after_crawl", label: "수집할 때마다" },
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주 (월요일)" },
];

export default function AdminNewsPage() {
  const [keywords, setKeywords] = useState("");
  const [collectInterval, setCollectInterval] = useState<CollectInterval>("weekly");
  const [collectDays, setCollectDays] = useState("7");
  const [emailInterval, setEmailInterval] = useState<EmailInterval>("weekly");
  const [recipients, setRecipients] = useState("");
  const [githubKeys, setGithubKeys] = useState<GithubKeyRow[]>([]);
  const [githubDrafts, setGithubDrafts] = useState<Record<string, string>>({});
  const [githubSaving, setGithubSaving] = useState<string | null>(null);
  const [githubCopying, setGithubCopying] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [crawlRun, setCrawlRun] = useState<CrawlRun | null>(null);
  const [watchFrom, setWatchFrom] = useState<number | null>(null);

  const crawlState = describeRun(crawlRun, watchFrom);

  useEffect(() => {
    let timer = 0;
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch("/api/admin/news/crawl");
        const body = await res.json();
        if (stopped) return;
        if (!res.ok) {
          setMessage({ text: body.error ?? "수집 상태를 확인하지 못했습니다.", ok: false });
          return;
        }
        const run = (body.run ?? null) as CrawlRun | null;
        setCrawlRun(run);
        const state = describeRun(run, watchFrom);
        if (state.active) timer = window.setTimeout(() => void tick(), 8000);
        else if (watchFrom !== null) setWatchFrom(null);
      } catch {
        if (!stopped) setMessage({ text: "수집 상태를 확인하지 못했습니다.", ok: false });
      }
    }

    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [watchFrom]);

  useEffect(() => {
    fetch("/api/admin/news/settings")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        const settings = body.settings as NewsCrawlSettings;
        setKeywords(settings.keywords.join("\n"));
        setCollectInterval(settings.collectInterval);
        setCollectDays(String(settings.collectDays));
        setEmailInterval(settings.emailInterval);
        setRecipients(settings.recipientEmails.join("\n"));
        setGithubKeys(body.githubKeys ?? []);
      })
      .catch((e) => setMessage({ text: (e as Error).message, ok: false }))
      .finally(() => setLoading(false));
  }, []);

  function payload() {
    return {
      keywords: keywords.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
      collectInterval,
      collectDays: Number(collectDays) || 7,
      emailInterval,
      recipientEmails: recipients.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
    };
  }

  async function saveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/news/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      const settings = body.settings as NewsCrawlSettings;
      setKeywords(settings.keywords.join("\n"));
      setRecipients(settings.recipientEmails.join("\n"));
      setMessage({ text: "설정을 저장했습니다.", ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setMessage(null);
    try {
      const saveRes = await fetch("/api/admin/news/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.error ?? "저장 실패");

      const res = await fetch("/api/admin/news/crawl", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "실행 요청 실패");
      setMessage(null);
      setWatchFrom(Date.now());
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setRunning(false);
    }
  }

  async function saveGithubKey(key: string) {
    setGithubSaving(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: githubDrafts[key] ?? "" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      setGithubKeys((prev) =>
        prev.map((row) =>
          row.key === key
            ? { ...row, hasValue: !body.deleted, masked: body.deleted ? null : body.masked }
            : row
        )
      );
      setGithubDrafts((prev) => ({ ...prev, [key]: "" }));
      setMessage({ text: body.deleted ? "삭제되었습니다." : "저장했습니다.", ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setGithubSaving(null);
    }
  }

  async function copyGithubKey(key: string) {
    setGithubCopying(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/keys/reveal?key=${encodeURIComponent(key)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "복사 실패");
      await navigator.clipboard.writeText(body.value);
      setMessage({ text: "클립보드에 복사했습니다.", ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setGithubCopying(null);
    }
  }

  if (loading) return <p className="text-sm text-black/50">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>📰 데이터뉴스 자동수집</CardTitle>
          <CardDescription>데이터관련 뉴스수집 화면에서 사용할 설정값을 저장합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div>
            <Label className="mb-1.5 block">검색 키워드</Label>
            <Textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={6}
              placeholder={"한 줄에 하나씩\n신한카드 빅데이터"}
            />
            <p className="mt-1 text-xs text-black/45">줄 또는 쉼표로 구분합니다.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">수집 주기</Label>
              <select
                value={collectInterval}
                onChange={(e) => setCollectInterval(e.target.value as CollectInterval)}
                className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-shinhan-blue"
              >
                {COLLECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">한 번에 수집할 기간 (일)</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={collectDays}
                onChange={(e) => setCollectDays(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">메일 발송 주기</Label>
              <select
                value={emailInterval}
                onChange={(e) => setEmailInterval(e.target.value as EmailInterval)}
                className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-shinhan-blue"
              >
                {EMAIL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">자동발송 수신 이메일</Label>
              <Textarea
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                rows={4}
                placeholder={"한 줄에 하나씩\nname@company.com"}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void saveSettings()} disabled={saving || running}>
              {saving ? "저장 중..." : "설정 저장"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void runNow()} disabled={saving || running || crawlState.active}>
              {running ? "요청 중..." : crawlState.active ? "수집 진행 중" : "지금 수집 실행"}
            </Button>
          </div>
          <p className={`text-sm ${crawlState.ok ? "text-emerald-600" : "text-red-500"}`}>
            {crawlState.text}
            {crawlRun?.htmlUrl ? (
              <>
                {" "}
                <a href={crawlRun.htmlUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  실행 기록
                </a>
              </>
            ) : null}
          </p>
          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>▶️ 자동수집 실행</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(githubKeys.length > 0 ? githubKeys : NEWS_GITHUB_KEY_DEFS.map((def) => ({
            key: def.key,
            label: def.label,
            placeholder: def.placeholder ?? "값 입력",
            hasValue: false,
            masked: null,
          }))).map((row) => {
            const usage = NEWS_GITHUB_KEY_DEFS.find((def) => def.key === row.key)?.usage;
            return (
            <div key={row.key} className="rounded-xl border border-black/5 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{row.label}</h3>
                {!row.hasValue && <span className="text-xs text-black/40">미등록</span>}
              </div>
              {usage ? (
                <p className="mt-1 text-xs leading-relaxed text-black/50">{usage}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  placeholder={row.hasValue ? row.masked ?? "" : row.placeholder}
                  value={githubDrafts[row.key] ?? ""}
                  onChange={(e) => setGithubDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue placeholder:text-black/70 placeholder:tracking-wider"
                />
                {row.hasValue && (
                  <button
                    type="button"
                    onClick={() => void copyGithubKey(row.key)}
                    disabled={githubCopying === row.key}
                    className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black/60 hover:border-shinhan-blue hover:text-shinhan-blue disabled:opacity-50"
                  >
                    {githubCopying === row.key ? "복사 중..." : "복사"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void saveGithubKey(row.key)}
                  disabled={githubSaving === row.key}
                  className="shrink-0 rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
                >
                  {githubSaving === row.key ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
