import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiKey } from "@/lib/apiKeys";
import { downloadDriveFile } from "@/lib/googleDrive";
import { fetchKosisRows, fetchPopulationByMonth, type PopulationShare } from "@/lib/kosis";
import { buildMonthlyPoints, monthsInAmountFile, type DemoCell, type SeriesCell } from "@/lib/kosisBuild";

function nextMonth(yearMonth: string) {
  const date = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(4)), 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function spans(months: string[]): [string, string][] {
  const sorted = [...months].sort();
  if (sorted.length === 0) return [];
  const ranges: [string, string][] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const month of sorted.slice(1)) {
    if (month !== nextMonth(prev)) {
      ranges.push([start, prev]);
      start = month;
    }
    prev = month;
  }
  ranges.push([start, prev]);
  return ranges;
}

function gapMonths(months: string[]) {
  if (months.length < 2) return [];
  const present = new Set(months);
  const missing: string[] = [];
  let cursor = nextMonth(months[0]);
  const last = months[months.length - 1];
  while (cursor < last) {
    if (!present.has(cursor)) missing.push(cursor);
    cursor = nextMonth(cursor);
  }
  return missing;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headers = (lines[0] ?? "").split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("kosis_shc_points")
    .select("year_month, updated_at")
    .order("year_month", { ascending: false });
  if (error) {
    const missing = /kosis_shc_points|does not exist|schema cache/i.test(error.message);
    return NextResponse.json(
      { error: missing ? "kosis_shc_points 표가 없습니다. supabase/schema.sql의 해당 구문을 한 번 실행해주세요." : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ months: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const amtFileId = typeof body?.amtFileId === "string" ? body.amtFileId : "";
  const demoFileId = typeof body?.demoFileId === "string" ? body.demoFileId : "";
  const overwrite = body?.overwrite === true;
  if (!amtFileId || !demoFileId) {
    return NextResponse.json({ error: "금액 파일(shc_amt)과 인구 파일(shc_demo)을 모두 선택해주세요." }, { status: 400 });
  }

  const [serviceAccount, kosisKey] = await Promise.all([
    resolveApiKey("GOOGLE_SERVICE_ACCOUNT_JSON", user.id),
    resolveApiKey("KOSIS_API_KEY", user.id),
  ]);
  if (!serviceAccount) {
    return NextResponse.json({ error: "Google 서비스 계정 키가 없습니다. API 키 관리에서 등록해주세요." }, { status: 400 });
  }
  if (!kosisKey) {
    return NextResponse.json({ error: "KOSIS API 키가 없습니다. API 키 관리에서 등록해주세요." }, { status: 400 });
  }

  let amtRows: Record<string, string>[];
  let demoRows: Record<string, string>[];
  try {
    const [amtBuf, demoBuf] = await Promise.all([
      downloadDriveFile(amtFileId, serviceAccount),
      downloadDriveFile(demoFileId, serviceAccount),
    ]);
    amtRows = parseCsv(new TextDecoder("utf-8").decode(amtBuf));
    demoRows = parseCsv(new TextDecoder("utf-8").decode(demoBuf));
  } catch (error) {
    return NextResponse.json({ error: `Drive 파일을 읽지 못했습니다: ${(error as Error).message}` }, { status: 500 });
  }

  const months = monthsInAmountFile(amtRows);
  if (months.length === 0) {
    return NextResponse.json({ error: "금액 파일에서 기준년월을 찾지 못했습니다." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("kosis_shc_points")
    .select("year_month, series, demo")
    .gte("year_month", months[0])
    .lte("year_month", months[months.length - 1]);
  if (existingError) {
    const missing = /kosis_shc_points|does not exist|schema cache/i.test(existingError.message);
    return NextResponse.json(
      { error: missing ? "kosis_shc_points 표가 없습니다. supabase/schema.sql의 해당 구문을 한 번 실행해주세요." : existingError.message },
      { status: 500 }
    );
  }

  const missing = gapMonths(months);
  const storedRows = (existing ?? []) as { year_month: string; series: Record<string, SeriesCell> | null; demo: DemoCell | null }[];
  const stored = new Map(storedRows.map((row) => [row.year_month, row]));
  const overlap = months.filter((month) => stored.has(month));

  try {
    const span: string[] = [];
    for (let cursor = months[0]; cursor <= months[months.length - 1]; cursor = nextMonth(cursor)) span.push(cursor);
    const needsStat = (month: string) => {
      const row = stored.get(month);
      const retail = row?.series?.F01;
      const population = row?.demo?.population ?? [];
      const hasRetail = retail?.kosisIndex != null || retail?.kosisAmount != null;
      const hasPopulation = population.some((band) => band.share != null);
      return !hasRetail || !hasPopulation;
    };
    const needKosis = span.filter(needsStat);
    const indexRows: Awaited<ReturnType<typeof fetchKosisRows>> = [];
    const amountRows: Awaited<ReturnType<typeof fetchKosisRows>> = [];
    const populationByMonth = new Map<string, PopulationShare[]>();
    for (const [from, to] of spans(needKosis)) {
      const [indexPart, amountPart, populationPart] = await Promise.all([
        fetchKosisRows(kosisKey, "index", from, to),
        fetchKosisRows(kosisKey, "amount", from, to),
        fetchPopulationByMonth(kosisKey, from, to),
      ]);
      indexRows.push(...indexPart);
      amountRows.push(...amountPart);
      for (const [month, shares] of populationPart) populationByMonth.set(month, shares);
    }

    let f06Base = stored.get("202001")?.series?.F06?.kosisAmount ?? null;
    if (f06Base == null && !stored.has("202001") && !needKosis.includes("202001")) {
      const { data: baseRow } = await admin.from("kosis_shc_points").select("series").eq("year_month", "202001").maybeSingle();
      f06Base = (baseRow?.series as Record<string, SeriesCell> | null)?.F06?.kosisAmount ?? null;
    }

    const gapRows = missing.filter((month) => !months.includes(month)).map((month) => ({ TA_YM: month }));
    const points = buildMonthlyPoints([...amtRows, ...gapRows], demoRows, indexRows, amountRows, populationByMonth, f06Base);
    for (const point of points) {
      const old = stored.get(point.year_month);
      if (!old) continue;
      if (old.series) {
        for (const [id, cell] of Object.entries(point.series)) {
          const kept = old.series[id];
          if (!kept) continue;
          if (kept.kosisAmount != null) cell.kosisAmount = kept.kosisAmount;
          if (kept.kosisIndex != null) cell.kosisIndex = kept.kosisIndex;
          if (!overwrite) cell.shc = kept.shc;
        }
      }
      const keptPopulation = old.demo?.population ?? [];
      if (keptPopulation.some((band) => band.share != null)) point.demo.population = keptPopulation;
      if (!overwrite && old.demo?.shinhan?.length) point.demo.shinhan = old.demo.shinhan;
    }

    const writing = overwrite ? points : points.filter((point) => needsStat(point.year_month) || !stored.has(point.year_month));
    const now = new Date().toISOString();
    if (writing.length > 0) {
      const { error: saveError } = await admin.from("kosis_shc_points").upsert(
        writing.map((point) => ({ ...point, updated_at: now })),
        { onConflict: "year_month" }
      );
      if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
      try {
        revalidateTag("kosis-compare", { expire: 0 });
        revalidatePath("/api/kosis/compare");
      } catch (error) {
        console.error("compare cache purge failed", error);
      }
    }
    if (overlap.length > 0 && !overwrite) {
      return NextResponse.json({
        needConfirm: true,
        overlap,
        incoming: months.length,
        range: [months[0], months[months.length - 1]],
        missing,
        saved: writing.length,
        kosisMonths: needKosis.length,
      });
    }
    return NextResponse.json({
      ok: true,
      saved: writing.length,
      overwritten: overwrite ? overlap.length : 0,
      range: [months[0], months[months.length - 1]],
      missing,
      kosisMonths: needKosis.length,
    });
  } catch (error) {
    return NextResponse.json({ error: `통계청 조회 또는 저장에 실패했습니다: ${(error as Error).message}` }, { status: 500 });
  }
}
