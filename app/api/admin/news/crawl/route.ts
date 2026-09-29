import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";

const WORKFLOW_FILE = "weekly_news_crawl.yml";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { days, extraKeywords } = body as { days?: number; extraKeywords?: string };

  const token = await resolveApiKey("GITHUB_PAT", user.id);
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_PAT 키가 등록되지 않았습니다. /admin/api-keys 에서 등록해주세요." },
      { status: 400 }
    );
  }
  const repo = await resolveApiKey("GITHUB_REPO", user.id);
  if (!repo || !repo.includes("/")) {
    return NextResponse.json(
      { error: "GITHUB_REPO 키(owner/repo 형식)가 등록되지 않았습니다. /admin/api-keys 에서 등록해주세요." },
      { status: 400 }
    );
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          days: String(days ?? 7),
          extra_keywords: extraKeywords ?? "",
        },
      }),
    }
  );

  if (!ghRes.ok && ghRes.status !== 204) {
    const text = await ghRes.text().catch(() => "");
    return NextResponse.json({ error: `GitHub API 오류 ${ghRes.status}: ${text}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: "GitHub Actions에 뉴스 수집 워크플로우 실행을 요청했습니다. 완료까지 몇 분 정도 걸립니다.",
  });
}
