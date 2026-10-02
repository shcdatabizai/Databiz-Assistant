"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MyNewsSettings } from "@/lib/myNews";
import { DEFAULT_MY_NEWS_SETTINGS } from "@/lib/myNews";

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
      style={{ background: checked ? "#0046ff" : "#d4d4d8" }}
    >
      <span
        className="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0px)" }}
      />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-black/5 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-black/45">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function MyNewsSettingsClient() {
  const [terms, setTerms] = useState("");
  const [settings, setSettings] = useState<MyNewsSettings>(DEFAULT_MY_NEWS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/news/watch")
      .then((r) => r.json())
      .then((data) => {
        setTerms((data.terms ?? []).join("\n"));
        if (data.settings) setSettings(data.settings);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/news/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordsText: terms, settings }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      setMessage({ text: "설정을 저장했습니다.", ok: true });
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link href="/my-news" aria-label="마이거래처 뉴스로 돌아가기" />}
          >
            <ChevronLeft />
          </Button>
          My거래처 뉴스 설정
        </h1>
        <p className="mt-1 text-sm text-black/50">키워드와 자동 수집, 메일 발송을 여기서 정합니다.</p>
      </div>
      {loading ? <p className="text-sm text-black/50">불러오는 중...</p> : null}
      <form onSubmit={save} className="flex flex-col gap-6">
        <section className="rounded-2xl border border-black/10 bg-white p-5">
          <h2 className="text-sm font-semibold">수집 키워드·업체명</h2>
          <p className="mt-1 text-xs text-black/45">한 줄에 하나, 또는 세미콜론(;)으로 여러 개를 넣을 수 있습니다.</p>
          <textarea
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            rows={8}
            placeholder={"소비트렌드\nOO마트"}
            className="mt-3 w-full rounded-xl border border-black/10 px-3 py-3 text-sm leading-relaxed outline-none focus:border-shinhan-blue"
          />
        </section>

        <section className="rounded-2xl border border-black/10 bg-white px-5">
          <Row label="자동 수집" hint="켜 두면 등록한 키워드로 기사를 모읍니다.">
            <Switch
              checked={settings.autoCollect}
              label="자동 수집"
              onChange={(autoCollect) => setSettings((prev) => ({ ...prev, autoCollect }))}
            />
          </Row>
          {settings.autoCollect ? (
            <>
              <Row label="수집 주기">
                <div className="flex gap-2">
                  {(
                    [
                      ["weekly", "매주(월)"],
                      ["daily", "매일"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, interval: value }))}
                      className={`h-11 rounded-lg px-4 text-sm font-medium ${
                        settings.interval === value
                          ? "bg-[#0046ff] text-white"
                          : "border border-black/10 bg-white text-black/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="자동 수집 결과 메일 발송" hint="수집이 끝나면 아래 주소로 보냅니다.">
                <Switch
                  checked={settings.autoEmail}
                  label="자동 수집 결과 메일 발송"
                  onChange={(autoEmail) => setSettings((prev) => ({ ...prev, autoEmail }))}
                />
              </Row>
              {settings.autoEmail ? (
                <div className="py-4">
                  <Input
                    type="email"
                    required
                    value={settings.email}
                    onChange={(event) => setSettings((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="수신 메일 주소"
                    className="h-11"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        {message ? (
          <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>
        ) : null}
        <Button type="submit" className="h-11 w-full text-base" disabled={saving || loading}>
          {saving ? "저장 중..." : "설정 저장"}
        </Button>
      </form>
    </div>
  );
}
