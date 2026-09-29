import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDriveFileId } from "@/lib/googleDrive";

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

  // TODO(기능4): 서비스 계정으로 Drive에서 parquet을 다운로드해 dashboard_generator.py
  // 집계 로직을 실행하고 dashboard_monthly_metrics에 결과를 저장하는 처리 파이프라인은
  // 별도 작업으로 이어서 구현합니다. 지금은 메타데이터 등록까지만 수행합니다.

  return NextResponse.json({ ok: true, fileId });
}
