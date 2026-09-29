import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-shinhan-blue-50 text-2xl">
            🛠️
          </span>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
          <p className="text-sm leading-relaxed text-black/55 sm:text-base">{description}</p>
          <Badge variant="outline">준비중입니다</Badge>
          <Button className="mt-4" nativeButton={false} render={<Link href="/" />}>
            메인으로 돌아가기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
