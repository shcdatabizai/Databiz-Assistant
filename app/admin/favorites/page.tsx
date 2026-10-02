"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SHARED_FAVORITES,
  FAVORITE_SECTIONS,
  type FavoriteSection,
  type SharedFavorite,
} from "@/lib/sharedFavorites";

export default function AdminFavoritesPage() {
  const [items, setItems] = useState<SharedFavorite[]>(DEFAULT_SHARED_FAVORITES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/favorites")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        setItems(body.items?.length ? body.items : DEFAULT_SHARED_FAVORITES);
      })
      .catch((error) => setMessage({ text: (error as Error).message, ok: false }))
      .finally(() => setLoading(false));
  }, []);

  function updateItem(id: string, patch: Partial<SharedFavorite>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/favorites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      setItems(body.items);
      setMessage({ text: "즐겨찾기를 저장했습니다.", ok: true });
    } catch (error) {
      setMessage({ text: (error as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-black/50">불러오는 중...</p>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>⭐ 즐겨찾기 설정</CardTitle>
          <CardDescription>사이트명, URL, 설명을 저장하면 부서 공용계정 즐겨찾기 화면에 반영됩니다. 설명은 각 사이트 카드 하단에 표시됩니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {FAVORITE_SECTIONS.map((group) => (
            <section key={group.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {group.emoji} {group.title}
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setItems((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        section: group.id,
                        name: "",
                        url: "",
                        description: "",
                        icon: "favicon",
                      },
                    ])
                  }
                >
                  추가
                </Button>
              </div>
              {items
                .filter((item) => item.section === group.id)
                .map((item) => (
                  <div key={item.id} className="grid gap-3 rounded-xl border border-black/5 p-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${item.id}-name`}>사이트명</Label>
                      <Input
                        id={`${item.id}-name`}
                        value={item.name}
                        onChange={(event) => updateItem(item.id, { name: event.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${item.id}-url`}>URL</Label>
                      <Input
                        id={`${item.id}-url`}
                        value={item.url}
                        onChange={(event) => updateItem(item.id, { url: event.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor={`${item.id}-description`}>설명 (선택)</Label>
                      <Input
                        id={`${item.id}-description`}
                        value={item.description}
                        onChange={(event) => updateItem(item.id, { description: event.target.value })}
                        placeholder="로그인 ID : "
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <label className="flex items-center gap-2 text-sm text-black/60">
                        구역
                        <select
                          value={item.section}
                          onChange={(event) => updateItem(item.id, { section: event.target.value as FavoriteSection })}
                          className="rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-shinhan-blue"
                        >
                          {FAVORITE_SECTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setItems((prev) => prev.filter((row) => row.id !== item.id))}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>
                ))}
            </section>
          ))}
          <div className="flex items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? "저장 중..." : "설정 저장"}
            </Button>
            {message ? (
              <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-red-500"}`}>{message.text}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
