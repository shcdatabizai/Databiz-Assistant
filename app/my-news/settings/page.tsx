import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MyNewsSettingsClient from "@/components/news/MyNewsSettingsClient";

export default async function MyNewsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Card>
          <CardContent className="py-10">
            <h1 className="text-lg font-bold">로그인이 필요합니다</h1>
            <Button nativeButton={false} render={<Link href="/login" />} className="mt-4">
              로그인
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <MyNewsSettingsClient />;
}
