import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDriveFileId } from "@/lib/googleDrive";

const WORKFLOW_FILE = "dashboard_build.yml";

async function dispatchDashboardBuild(userId: string, yearMonth: string, fileId: string) {
  const token = await resolveApiKey("GITHUB_PAT", userId);
  const repo = await resolveApiKey("GITHUB_REPO", userId);
  if (!token || !repo || !repo.includes("/")) {
    return "파일은 저장됐지만 GitHub 실행 정보가 없어 집계를 시작하지 못했습니다.";
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
        inputs: { year_month: yearMonth, drive_file_id: fileId },
      }),
    }
  );
  if (!ghRes.ok && ghRes.status !== 204) {
    const text = await ghRes.text().catch(() => "");
    return `파일은 저장됐지만 집계 요청에 실패했습니다. ${ghRes.status} ${text}`.slice(0, 400);
  }
  return null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("dashboard_monthly_uploads")
    .select("*")
    .order("year_month", { ascending: false })
    .limit(24);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const body = await request.json();
  const { yearMonth, driveLink, fileName } = body as {
    yearMonth?: string;
    driveLink?: string;
    fileName?: string;
  };

  if (!yearMonth || !/^\d{6}$/.test(yearMonth)) {
    return NextResponse.json({ error: "yearMonth은 YYYYMM 6자리 형식이어야 합니다." }, { status: 400 });
  }
  if (!driveLink) {
    return NextResponse.json({ error: "driveLink가 필요합니다." }, { status: 400 });
  }

  const fileId = extractDriveFileId(driveLink);
  if (!fileId) {
    return NextResponse.json(
      { error: "Google Drive 링크에서 파일 ID를 찾을 수 없습니다. 공유링크를 다시 확인해주세요." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("dashboard_monthly_uploads").upsert({
    year_month: yearMonth,
    drive_file_id: fileId,
    drive_file_name: fileName ?? null,
    drive_link: driveLink,
    uploaded_by: user.id,
    uploaded_at: new Date().toISOString(),
    status: "registered",
    error_message: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dispatchError = await dispatchDashboardBuild(user.id, yearMonth, fileId);
  if (dispatchError) {
    return NextResponse.json({ ok: true, fileId, warning: dispatchError });
  }

  return NextResponse.json({
    ok: true,
    fileId,
    message: "원본을 등록하고 대시보드 집계 실행을 요청했습니다.",
  });
}
