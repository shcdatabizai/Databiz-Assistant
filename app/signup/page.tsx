"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
            <h1 className="text-xl font-bold text-foreground">가입 신청 완료</h1>
            <p className="text-sm text-black/55">
              이메일 인증 메일을 확인해주세요. 인증 후 로그인할 수 있습니다.
            </p>
            <Link href="/login" className="mt-2 text-sm font-medium text-shinhan-blue">
              로그인으로 이동
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16 sm:py-24">
      <div className="text-center">
        <h1 className="text-xl font-bold text-foreground">회원가입</h1>
        <p className="mt-1 text-sm text-black/55">My거래처 뉴스 알림 등 개인화 기능을 이용하려면 가입이 필요합니다.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <GoogleAuthButton intent="signup" />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-black/10" />
            <span className="text-xs text-black/40">또는 이메일로 가입</span>
            <div className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="text"
              required
              placeholder="이름"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
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
              minLength={6}
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-black/55">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-shinhan-blue">
          로그인
        </Link>
      </p>
    </div>
  );
}
