"use client";

import { useEffect, useState } from "react";
import { API_KEY_GROUPS } from "@/lib/apiKeyDefs";

interface KeyRow {
  key: string;
  label: string;
  usage: string;
  group: string;
  hasValue: boolean;
  masked: string | null;
  updatedAt: string | null;
}

export default function ApiKeysAdminPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; text: string; ok: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/keys")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        setKeys(body.keys);
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(key: string) {
    setSaving(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: drafts[key] ?? "" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");

      setKeys((prev) =>
        prev.map((k) =>
          k.key === key
            ? { ...k, hasValue: !body.deleted, masked: body.deleted ? null : body.masked }
            : k
        )
      );
      setDrafts((prev) => ({ ...prev, [key]: "" }));
      setMessage({ key, text: body.deleted ? "삭제되었습니다." : "저장되었습니다.", ok: true });
    } catch (e) {
      setMessage({ key, text: (e as Error).message, ok: false });
    } finally {
      setSaving(null);
    }
  }

  async function handleCopy(key: string) {
    setCopying(key);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/keys/reveal?key=${encodeURIComponent(key)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "복사 실패");
      await navigator.clipboard.writeText(body.value);
      setMessage({ key, text: "클립보드에 복사되었습니다. (화면에는 표시되지 않습니다)", ok: true });
    } catch (e) {
      setMessage({ key, text: (e as Error).message, ok: false });
    } finally {
      setCopying(null);
    }
  }

  if (loading) return <p className="text-sm text-black/50">불러오는 중...</p>;
  if (loadError) return <p className="text-sm text-red-500">{loadError}</p>;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-black/55">
        키 값은 서버에서 AES-256으로 암호화되어 저장되며, 이 화면에서는 마지막 4자리만 표시됩니다.
        새 값을 입력하고 저장하면 이전 값을 덮어씁니다. 값을 비운 채 저장하면 키가 삭제됩니다.
      </p>

      {API_KEY_GROUPS.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-semibold text-shinhan-blue">{group}</h2>
          <div className="flex flex-col gap-3">
            {keys
              .filter((k) => k.group === group)
              .map((k) => (
                <div key={k.key} className="rounded-xl border border-black/5 bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{k.label}</h3>
                    {!k.hasValue && <span className="text-xs text-black/40">미등록</span>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-black/50">{k.usage}</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      placeholder={k.hasValue ? k.masked ?? "" : "값 입력"}
                      value={drafts[k.key] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [k.key]: e.target.value }))}
                      className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue placeholder:text-black/70 placeholder:tracking-wider"
                    />
                    {k.hasValue && (
                      <button
                        onClick={() => handleCopy(k.key)}
                        disabled={copying === k.key}
                        title="값을 화면에 표시하지 않고 클립보드로 복사합니다"
                        className="shrink-0 rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black/60 hover:border-shinhan-blue hover:text-shinhan-blue disabled:opacity-50"
                      >
                        {copying === k.key ? "복사 중..." : "복사"}
                      </button>
                    )}
                    <button
                      onClick={() => handleSave(k.key)}
                      disabled={saving === k.key}
                      className="shrink-0 rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
                    >
                      {saving === k.key ? "저장 중..." : "저장"}
                    </button>
                  </div>
                  {message?.key === k.key && (
                    <p className={`mt-2 text-xs ${message.ok ? "text-emerald-600" : "text-red-500"}`}>
                      {message.text}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
