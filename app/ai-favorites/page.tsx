"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { ClaudeLogo, ChatGptLogo, GeminiLogo, ZoomLogo } from "@/components/icons/ServiceLogos";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SHARED_FAVORITES,
  FAVORITE_SECTIONS,
  favoriteIconUrl,
  type FavoriteIcon,
  type SharedFavorite,
} from "@/lib/sharedFavorites";

const BRAND: Record<Exclude<FavoriteIcon, "favicon">, { color: string; Logo: typeof ClaudeLogo }> = {
  claude: { color: "#D97757", Logo: ClaudeLogo },
  chatgpt: { color: "#000000", Logo: ChatGptLogo },
  gemini: { color: "#8E75B2", Logo: GeminiLogo },
  zoom: { color: "#0B5CFF", Logo: ZoomLogo },
};

function FavoriteMark({ item }: { item: SharedFavorite }) {
  const [failed, setFailed] = useState(false);
  if (item.icon !== "favicon") {
    const brand = BRAND[item.icon];
    const Logo = brand.Logo;
    return (
      <span
        className="flex h-12 w-12 items-center justify-center rounded-xl p-2.5"
        style={{ backgroundColor: brand.color }}
      >
        <Logo className="h-full w-full" />
      </span>
    );
  }

  const src = favoriteIconUrl(item);
  if (!src || failed) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-shinhan-blue text-lg font-semibold text-white">
        {item.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/10">
      <img src={src} alt="" className="h-8 w-8 object-contain" onError={() => setFailed(true)} />
    </span>
  );
}

export default function AiFavoritesPage() {
  const router = useRouter();
  const [items, setItems] = useState<SharedFavorite[]>(DEFAULT_SHARED_FAVORITES);
  const [role, setRole] = useState<"admin" | "member" | null>(null);
  const [open, setOpen] = useState(false);
  const [infoId, setInfoId] = useState<string | null>(null);

  async function loadRole() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setRole(null);
      return null;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    const next = profile?.role === "admin" ? "admin" : "member";
    setRole(next);
    return next;
  }

  useEffect(() => {
    fetch("/api/favorites")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        if (Array.isArray(body.items) && body.items.length > 0) setItems(body.items);
      })
      .catch(() => setItems(DEFAULT_SHARED_FAVORITES));
    void loadRole();
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">부서 공용계정 즐겨찾기</h1>
        <p className="mt-2 text-sm leading-relaxed text-black/55 sm:text-base">
          부서에서 사용하는 AI·회의 서비스와 자주 방문하는 사이트입니다.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {FAVORITE_SECTIONS.map((group) => {
          const links = items.filter((item) => item.section === group.id);
          if (links.length === 0) return null;
          return (
            <section key={group.id}>
              <h2 className="mb-3 text-base font-semibold text-foreground">
                {group.emoji} {group.title}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {links.map((link) => (
                  <div key={link.id} className="relative">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl bg-white px-3 py-4 text-center ring-1 ring-black/10 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <FavoriteMark item={link} />
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground group-hover:text-shinhan-blue sm:text-base">
                        {link.name}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-black/30 group-hover:text-shinhan-blue">
                          <path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </a>
                    {link.description ? (
                      <button
                        type="button"
                        aria-label={`${link.name} 설명`}
                        onClick={() => setInfoId((current) => (current === link.id ? null : link.id))}
                        className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full border border-black/15 bg-white text-[11px] font-semibold text-black/50 hover:border-shinhan-blue hover:text-shinhan-blue"
                      >
                        i
                      </button>
                    ) : null}
                    {infoId === link.id && link.description ? (
                      <div className="absolute top-8 right-2 z-10 max-w-[12rem] rounded-lg border border-black/10 bg-white px-3 py-2 text-xs leading-relaxed text-black/70 shadow-md">
                        {link.description}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          if (role === "admin") {
            router.push("/admin/favorites");
            return;
          }
          setOpen(true);
        }}
        className="mt-8 flex w-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-white px-4 py-3 text-sm font-medium text-black/70 hover:border-shinhan-blue hover:text-shinhan-blue"
      >
        + 즐겨찾기 추가
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>즐겨찾기 추가</DialogTitle>
            <DialogDescription>
              즐겨찾기 추가. 관리자 계정으로 로그인한 뒤 즐겨찾기 설정에서 사이트를 추가할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <GoogleAuthButton
            onSuccess={() => {
              void loadRole().then((next) => {
                if (next === "admin") router.push("/admin/favorites");
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
