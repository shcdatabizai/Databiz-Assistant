"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

function initialOAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("error") !== "google_login_failed") return null;
  const reason = params.get("reason");
  return reason
    ? `Google 로그인에 실패했습니다. ${reason}`
    : "Google 로그인에 실패했습니다. 다시 시도해주세요.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialOAuthError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : error.message
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="text-xl font-bold text-foreground">로그인</h1>
        <p className="mt-1 text-sm text-black/55">데이터사업 업무지원 계정으로 로그인하세요.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <GoogleAuthButton intent="login" />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-black/10" />
            <span className="text-xs text-black/40">또는 이메일로 로그인</span>
            <div className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="email"
              required
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              required
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-black/55">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="font-medium text-shinhan-blue">
          회원가입
        </Link>
      </p>
    </div>
  );
}
