import Link from "next/link";
import { FEATURES, type FeatureStatus } from "@/lib/features";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<FeatureStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  live: { label: "이용가능", variant: "default" },
  beta: { label: "베타", variant: "secondary" },
  soon: { label: "준비중", variant: "outline" },
};

export default async function Home() {
  const user = await getCurrentUser();
  const features = FEATURES.map((feature) =>
    feature.id === "monthly-dashboard" && user?.role !== "admin"
      ? { ...feature, status: "soon" as const }
      : feature
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const status = STATUS_LABEL[feature.status];
          return (
            <Link key={feature.id} href={feature.href} className="group">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:ring-shinhan-blue/30 hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-shinhan-blue-50 text-xl">
                      {feature.emoji}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <CardTitle className="mt-2 text-base group-hover:text-shinhan-blue">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
                {feature.authRequired && (
                  <CardContent>
                    <span className="text-xs font-medium text-black/40">로그인 필요</span>
                  </CardContent>
                )}
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
