"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, ShieldCheck } from "lucide-react";
import { FEATURES } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [authState, setAuthState] = useState<{
    email: string | null;
    role: "admin" | "member" | null;
  }>({ email: null, role: null });
  const router = useRouter();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setAuthState({ email: null, role: null });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      setAuthState({ email: data.user.email ?? null, role: (profile?.role as "admin" | "member") ?? "member" });
    }
    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange(() => loadUser());
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAuthState({ email: null, role: null });
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src="/brand/logo/logo-kr-horizontal-blue.png"
            alt="신한카드"
            width={140}
            height={37}
            priority
            className="h-7 w-auto sm:h-8"
          />
          <span className="hidden border-l border-black/10 pl-2 text-sm font-medium text-black/60 sm:inline">
            데이터사업 업무지원센터
          </span>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="메뉴 열기"
                className="rounded-full text-black/70 hover:bg-black/5"
              />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col sm:max-w-xs">
            <SheetHeader>
              <SheetTitle>메뉴</SheetTitle>
            </SheetHeader>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
              {FEATURES.map((f) => (
                <SheetClose
                  key={f.id}
                  render={
                    <Link
                      href={f.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-black/80 transition-colors hover:bg-shinhan-blue-50 hover:text-shinhan-blue"
                    />
                  }
                >
                  <span className="text-base">{f.emoji}</span>
                  {f.title}
                </SheetClose>
              ))}
              {authState.role === "admin" && (
                <SheetClose
                  render={
                    <Link
                      href="/admin"
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-black/80 transition-colors hover:bg-shinhan-blue-50 hover:text-shinhan-blue"
                    />
                  }
                >
                  <ShieldCheck className="size-4" />
                  관리자
                </SheetClose>
              )}
            </nav>

            <SheetFooter className="border-t border-black/5">
              {authState.email ? (
                <>
                  <p className="truncate px-1 text-sm text-black/50">{authState.email}</p>
                  <Button variant="outline" className="justify-start gap-2" onClick={handleLogout}>
                    <LogOut className="size-4" />
                    로그아웃
                  </Button>
                </>
              ) : (
                <SheetClose
                  render={<Link href="/login" className={cn(buttonVariants({ variant: "default" }), "w-full")} />}
                >
                  로그인
                </SheetClose>
              )}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
