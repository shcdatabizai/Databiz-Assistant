import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/apiKeys";
import { fetchKosisMonthly } from "@/lib/kosis";
import { extractDriveFileId, downloadDriveFile } from "@/lib/googleDrive";
import { aggregateShcMonthly } from "@/lib/shcParquet";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }
  const admin = createAdminClient();
  const [{ data: rows, error: rowsErr }, { data: uploads, error: uploadsErr }] = await Promise.all([
    admin.from("kosis_shc_monthly").select("*").order("year_month", { ascending: false }).limit(24),
    admin.from("kosis_shc_uploads").select("*").order("year_month", { ascending: false }).limit(24),
  ]);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  if (uploadsErr) return NextResponse.json({ error: uploadsErr.message }, { status: 500 });
  return NextResponse.json({ rows, uploads });
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

  // 1) 업로드 메타데이터 등록 (processing)
  const { error: regErr } = await admin.from("kosis_shc_uploads").upsert({
    year_month: yearMonth,
    drive_file_id: fileId,
    drive_file_name: fileName ?? null,
    drive_link: driveLink,
    uploaded_by: user.id,
    uploaded_at: new Date().toISOString(),
    status: "processing",
    error_message: null,
  });
  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  // 2) Google 서비스 계정으로 Drive에서 parquet 다운로드 + 집계
  const serviceAccountJson = await resolveApiKey("GOOGLE_SERVICE_ACCOUNT_JSON", user.id);
  if (!serviceAccountJson) {
    await admin
      .from("kosis_shc_uploads")
      .update({ status: "error", error_message: "GOOGLE_SERVICE_ACCOUNT_JSON 키가 등록되지 않았습니다." })
      .eq("year_month", yearMonth);
    return NextResponse.json(
      { error: "Google 서비스 계정 키가 등록되지 않아 파일을 읽을 수 없습니다. /admin/api-keys 에서 등록해주세요." },
      { status: 400 }
    );
  }

  let agg;
  try {
    const buffer = await downloadDriveFile(fileId, serviceAccountJson);
    agg = await aggregateShcMonthly(buffer, yearMonth);
  } catch (e) {
    const message = (e as Error).message;
    await admin.from("kosis_shc_uploads").update({ status: "error", error_message: message }).eq("year_month", yearMonth);
    return NextResponse.json({ error: `parquet 처리 실패: ${message}` }, { status: 500 });
  }

  // 3) 신한카드 집계값 저장
  const { error: upsertErr } = await admin.from("kosis_shc_monthly").upsert({
    year_month: yearMonth,
    shc_total: agg.shcTotal,
    shc_medical: agg.shcMedical,
    shc_uploaded_by: user.id,
  });
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  await admin
    .from("kosis_shc_uploads")
    .update({ status: "done", row_count: agg.rowCount, error_message: null })
    .eq("year_month", yearMonth);

  // 4) KOSIS Open API로 동일 기준월 자동 조회 후 병합
  const kosisKey = await resolveApiKey("KOSIS_API_KEY", user.id);
  if (!kosisKey) {
    return NextResponse.json({
      ok: true,
      agg,
      warning: "KOSIS API 키가 등록되지 않아 신한카드 수치만 저장했습니다. /admin/api-keys 에서 키를 등록해주세요.",
    });
  }

  try {
    const kosis = await fetchKosisMonthly(kosisKey, yearMonth);
    const { error: mergeErr } = await admin
      .from("kosis_shc_monthly")
      .update({
        total_index: kosis.totalIndex,
        kosis_total: kosis.kosisTotal,
        kosis_medicine: kosis.kosisMedicine,
        kosis_fetched_at: new Date().toISOString(),
      })
      .eq("year_month", yearMonth);
    if (mergeErr) throw mergeErr;

    return NextResponse.json({ ok: true, agg, kosis });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      agg,
      warning: `신한카드 수치는 저장됐지만 KOSIS 조회에 실패했습니다: ${(e as Error).message}`,
    });
  }
}
