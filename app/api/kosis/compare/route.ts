import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { INDUSTRY_MATCHES, type DemoCell, type SeriesCell } from "@/lib/kosisBuild";

const COMPARE_CACHE_TAG = "kosis-compare";

function json(body: unknown, status: number, cache: boolean) {
  const headers = new Headers();
  if (cache) {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=2592000");
    headers.set("Vercel-Cache-Tag", COMPARE_CACHE_TAG);
  } else {
    headers.set("Cache-Control", "private, no-store");
  }
  return NextResponse.json(body, { status, headers });
}

interface PointRow {
  year_month: string;
  series: Record<string, SeriesCell> | null;
  demo: DemoCell | null;
}

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kosis_shc_points")
    .select("year_month, series, demo")
    .order("year_month", { ascending: true });

  if (error) {
    const missing = /kosis_shc_points|does not exist|schema cache/i.test(error.message);
    return json(
      { error: missing ? "비교 데이터 표가 아직 없습니다. 관리자에게 테이블 생성을 요청해주세요." : error.message },
      500,
      false
    );
  }

  const rows = (data ?? []) as PointRow[];
  if (rows.length === 0) {
    return json(
      { error: "저장된 비교 데이터가 없습니다. 관리자 화면에서 shc_amt, shc_demo를 등록해주세요." },
      404,
      false
    );
  }

  const months = rows.map((row) => row.year_month);
  const industries = INDUSTRY_MATCHES.map((match) => ({
    id: match.id,
    name: match.name,
    shc: rows.map((row) => row.series?.[match.id]?.shc ?? null),
    kosisAmount: rows.map((row) => row.series?.[match.id]?.kosisAmount ?? null),
    kosisIndex: rows.map((row) => row.series?.[match.id]?.kosisIndex ?? null),
  }));
  const demos = rows.map((row) => ({
    month: row.year_month,
    shinhan: row.demo?.shinhan ?? [],
    population: row.demo?.population ?? [],
  }));
  const latest = demos[demos.length - 1];

  return json({
    months,
    industries,
    demos,
    demo: {
      month: latest?.month ?? "",
      months,
      shinhan: latest?.shinhan ?? [],
      population: latest?.population ?? [],
    },
  }, 200, true);
}
