import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function entityTag(
  metrics: { year_month: string; computed_at: string | null; row_count: number | null }[],
  uploads: { year_month: string; status: string; error_message: string | null }[]
) {
  const body = JSON.stringify({
    metrics: metrics.map((row) => [row.year_month, row.computed_at, row.row_count]),
    uploads: uploads.map((row) => [row.year_month, row.status, row.error_message]),
  });
  let hash = 0;
  for (let index = 0; index < body.length; index += 1) hash = (hash * 31 + body.charCodeAt(index)) >>> 0;
  return `"dash-${hash.toString(16)}-${body.length}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "준비중입니다." }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: stamps, error: stampError }, { data: uploads, error: uploadsError }] = await Promise.all([
    admin.from("dashboard_monthly_metrics").select("year_month, row_count, computed_at").order("year_month", { ascending: false }).limit(24),
    admin.from("dashboard_monthly_uploads").select("year_month, status, drive_file_name, error_message").order("year_month", { ascending: false }).limit(24),
  ]);

  if (stampError) return NextResponse.json({ error: stampError.message }, { status: 500 });
  if (uploadsError) return NextResponse.json({ error: uploadsError.message }, { status: 500 });

  const uploadRows = uploads ?? [];
  const tag = entityTag(stamps ?? [], uploadRows);
  const headers = { ETag: tag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === tag) {
    return new NextResponse(null, { status: 304, headers });
  }

  const { data: metrics, error: metricsError } = await admin
    .from("dashboard_monthly_metrics")
    .select("year_month, payload, row_count, computed_at")
    .order("year_month", { ascending: false })
    .limit(24);
  if (metricsError) return NextResponse.json({ error: metricsError.message }, { status: 500 });
  return NextResponse.json({ metrics: metrics ?? [], uploads: uploadRows }, { headers });
}
