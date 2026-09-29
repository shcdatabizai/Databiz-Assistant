import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MyNewsClient from "@/components/news/MyNewsClient";

export default async function MyNewsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-shinhan-blue-50 text-2xl">
              🔔
            </span>
            <h1 className="text-lg font-bold text-foreground">로그인이 필요합니다</h1>
            <p className="text-sm text-black/55">
              My거래처 뉴스 알림은 회원 전용 기능입니다. 로그인 후 관심 키워드를 등록해보세요.
            </p>
            <Button nativeButton={false} render={<Link href="/login" />} className="mt-2">
              로그인
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <MyNewsClient />;
}
