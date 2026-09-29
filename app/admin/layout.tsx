import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ADMIN_NAV = [
  { href: "/admin", label: "개요" },
  { href: "/admin/api-keys", label: "API 키 관리" },
  { href: "/admin/data", label: "데이터 업로드" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const supabaseConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Card>
          <CardContent className="text-center">
            <h1 className="text-lg font-bold text-foreground">Supabase 설정이 필요합니다</h1>
            <p className="mt-2 text-sm text-black/55">
              `.env.local`에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY /
              SUPABASE_SECRET_KEY를 설정한 뒤 다시 시도해주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-lg font-bold text-foreground">로그인이 필요합니다</h1>
            <p className="text-sm text-black/55">관리자 계정으로 로그인해주세요.</p>
            <Button nativeButton={false} render={<Link href="/login" />} className="mt-2">
              로그인
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Card>
          <CardContent className="text-center">
            <h1 className="text-lg font-bold text-foreground">관리자만 접근할 수 있습니다</h1>
            <p className="mt-2 text-sm text-black/55">
              현재 계정({user.email})은 관리자 권한이 없습니다. 관리자에게 권한 부여를 요청해주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-xl font-bold text-foreground">관리자</h1>
      <p className="mb-6 text-sm text-black/50">{user.displayName ?? user.email}님, 환영합니다.</p>

      <nav className="mb-8 flex gap-1 border-b border-black/5">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2.5 text-sm font-medium text-black/60 transition-colors hover:text-shinhan-blue"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
