import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";

const WORKFLOW_FILE = "weekly_news_crawl.yml";

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubContext(userId: string) {
  const token = await resolveApiKey("GITHUB_PAT", userId);
  const repo = await resolveApiKey("GITHUB_REPO", userId);
  if (!token) return { error: "GitHub Personal Access Token이 등록되지 않았습니다.", status: 400 as const };
  if (!repo || !repo.includes("/")) {
    return { error: "GitHub 저장소(owner/repo)가 등록되지 않았습니다.", status: 400 as const };
  }
  return { token, repo };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const ctx = await githubContext(user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const ghRes = await fetch(
    `https://api.github.com/repos/${ctx.repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
    { headers: githubHeaders(ctx.token), cache: "no-store" }
  );
  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => "");
    return NextResponse.json({ error: `GitHub API 오류 ${ghRes.status}: ${text}` }, { status: 502 });
  }

  const data = await ghRes.json();
  const run = data.workflow_runs?.[0];
  if (!run) return NextResponse.json({ run: null });

  return NextResponse.json({
    run: {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
    },
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const ctx = await githubContext(user.id);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const ghRes = await fetch(
    `https://api.github.com/repos/${ctx.repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { ...githubHeaders(ctx.token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!ghRes.ok && ghRes.status !== 204) {
    const text = await ghRes.text().catch(() => "");
    return NextResponse.json({ error: `GitHub API 오류 ${ghRes.status}: ${text}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    message: "뉴스 수집 실행을 요청했습니다.",
  });
}
