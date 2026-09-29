import Image from "next/image";
import Link from "next/link";
import { FEATURES } from "@/lib/features";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  live: { label: "이용가능", variant: "default" },
  beta: { label: "베타", variant: "secondary" },
  soon: { label: "준비중", variant: "outline" },
};

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="border-b border-black/5 bg-gradient-to-b from-shinhan-blue-50 to-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:py-24">
          <Image
            src="/brand/logo/logo-kr-vertical-blue.png"
            alt="신한카드"
            width={160}
            height={160}
            priority
            className="h-24 w-auto sm:h-32"
          />
          <h1 className="max-w-2xl text-2xl font-bold leading-snug text-foreground sm:text-4xl">
            데이터사업 업무지원센터
          </h1>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
        <h2 className="mb-6 text-lg font-semibold text-foreground sm:text-xl">기능 메뉴</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const status = STATUS_LABEL[f.status];
            return (
              <Link key={f.id} href={f.href} className="group">
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:ring-shinhan-blue/30 hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-shinhan-blue-50 text-xl">
                        {f.emoji}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <CardTitle className="mt-2 text-base group-hover:text-shinhan-blue">{f.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{f.description}</CardDescription>
                  </CardHeader>
                  {f.authRequired && (
                    <CardContent>
                      <span className="text-xs font-medium text-black/40">로그인 필요</span>
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
