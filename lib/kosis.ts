import "server-only";

// kosis_shc/scripts/update_kosis.py 로직을 TypeScript로 이식.
const TBL_INDEX = "DT_1K41012"; // 재별 및 상품군별 소매판매액지수(2020=100.0)
const TBL_AMOUNT = "DT_1K41002"; // 재별 및 상품군별 판매액

export interface KosisRow {
  C1_NM?: string;
  C2_NM?: string;
  ITM_NM?: string;
  PRD_DE: string;
  DT: string;
  err?: string;
  errMsg?: string;
}

function normalizeCategory(name: string): string {
  return name.trim().replace(/\u3000/g, "").replace(/\s/g, "");
}

async function kosisFetch(
  apiKey: string,
  tblId: string,
  start: string,
  end: string,
  objLevels = 1
): Promise<KosisRow[]> {
  const objs: Record<string, string> = {};
  for (let i = 1; i <= 8; i++) objs[`objL${i}`] = i <= objLevels ? "ALL" : "";

  const params = new URLSearchParams({
    method: "getList",
    format: "json",
    jsonVD: "Y",
    apiKey,
    orgId: "101",
    tblId,
    itmId: "ALL",
    prdSe: "M",
    startPrdDe: start,
    endPrdDe: end,
    loadGubun: "2",
    ...objs,
  });

  const url = `https://kosis.kr/openapi/Param/statisticsParameterData.do?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const data = await res.json();

  if (!Array.isArray(data)) {
    if (data?.err) {
      const message = String(data.errMsg ?? "");
      if (/40000|40,000|셀/.test(message)) {
        throw new Error(`KOSIS API 오류 [${data.err}]: ${message}`);
      }
      if (data.err === "20" && objLevels < 2) {
        return kosisFetch(apiKey, tblId, start, end, objLevels + 1);
      }
      throw new Error(`KOSIS API 오류 [${data.err}]: ${message || JSON.stringify(data)}`);
    }
    throw new Error(`KOSIS 응답 형식이 예상과 다릅니다: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

function shiftMonth(yearMonth: string, delta: number) {
  const date = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(4)) - 1 + delta, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isCellLimit(error: unknown) {
  return /40000|40,000|셀/.test((error as Error).message ?? "");
}

/** chunkMonths가 0이면 기간을 한 번에 받는다. 4만 셀을 넘기면 반으로 나눠 다시 받는다. */
async function kosisFetchRange(apiKey: string, tblId: string, start: string, end: string, objLevels = 1, chunkMonths = 0) {
  if (chunkMonths <= 0) return kosisFetchSplit(apiKey, tblId, start, end, objLevels);
  const rows: KosisRow[] = [];
  let cursor = start;
  while (cursor <= end) {
    let chunkEnd = cursor;
    for (let step = 1; step < chunkMonths; step += 1) {
      const next = shiftMonth(chunkEnd, 1);
      if (next > end) break;
      chunkEnd = next;
    }
    rows.push(...(await kosisFetchSplit(apiKey, tblId, cursor, chunkEnd, objLevels)));
    cursor = shiftMonth(chunkEnd, 1);
  }
  return rows;
}

async function kosisFetchSplit(apiKey: string, tblId: string, start: string, end: string, objLevels: number): Promise<KosisRow[]> {
  try {
    return await kosisFetch(apiKey, tblId, start, end, objLevels);
  } catch (error) {
    if (!isCellLimit(error) || start >= end) throw error;
    const mid = shiftMonth(start, Math.max(1, Math.floor(monthDistance(start, end) / 2)));
    if (mid >= end) throw error;
    const left = await kosisFetchSplit(apiKey, tblId, start, mid, objLevels);
    const right = await kosisFetchSplit(apiKey, tblId, shiftMonth(mid, 1), end, objLevels);
    return [...left, ...right];
  }
}

function monthDistance(start: string, end: string) {
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(end.slice(4)) - Number(start.slice(4)));
  return Math.max(0, months);
}

export interface KosisMonthlyResult {
  totalIndex: number | null;
  kosisTotal: number | null;
  kosisMedicine: number | null;
}

/** 특정 기준년월(YYYYMM)의 KOSIS 총지수/합계금액/의약품금액을 조회. */
export async function fetchKosisMonthly(apiKey: string, yearMonth: string): Promise<KosisMonthlyResult> {
  const [indexRows, amountRows] = await Promise.all([
    kosisFetch(apiKey, TBL_INDEX, yearMonth, yearMonth),
    kosisFetch(apiKey, TBL_AMOUNT, yearMonth, yearMonth),
  ]);

  let totalIndex: number | null = null;
  for (const row of indexRows) {
    const cat = normalizeCategory(row.C1_NM || row.ITM_NM || "");
    if (["합계", "총지수", ""].includes(cat)) {
      const val = Number(String(row.DT).replace(/,/g, ""));
      if (!Number.isNaN(val)) totalIndex = val;
    }
  }

  let kosisTotal: number | null = null;
  let kosisMedicine: number | null = null;
  for (const row of amountRows) {
    const cat = normalizeCategory(row.C1_NM || row.ITM_NM || "");
    const val = Number(String(row.DT).replace(/,/g, ""));
    if (Number.isNaN(val)) continue;
    if (cat === "합계") kosisTotal = val;
    if (cat === "의약품") kosisMedicine = val;
  }

  return { totalIndex, kosisTotal, kosisMedicine };
}

export async function fetchKosisRows(apiKey: string, kind: "index" | "amount", start: string, end: string) {
  return kosisFetchRange(apiKey, kind === "index" ? TBL_INDEX : TBL_AMOUNT, start, end);
}

const POP_BANDS = [
  ["20 - 29세", "20대"],
  ["30 - 39세", "30대"],
  ["40 - 49세", "40대"],
  ["50 - 59세", "50대"],
  ["60세이상", "60세 이상"],
] as const;

function ageKey(name: string) {
  return name.replace(/\s/g, "").replace(/^ㆍ/, "");
}

/**
 * 경제활동인구조사 성/연령별 경제활동인구(계).
 * 구성비는 연령대 / 계. 15세 이상 인구를 쓰면 비취업 고령이 포함되어 60세 이상이 과대합니다.
 * 2025년 8월 기준 60세 이상은 계 대비 약 24%입니다.
 */
export interface PopulationShare {
  label: string;
  value: number | null;
  share: number | null;
}

function populationShares(rows: KosisRow[]): PopulationShare[] {
  const econ = rows.filter((row) => row.ITM_NM === "경제활동인구" && row.C1_NM === "계");
  const valueOf = (band: string) => {
    const row = econ.find((item) => ageKey(item.C2_NM || "") === ageKey(band));
    const value = row ? Number(String(row.DT).replace(/,/g, "")) : null;
    return value !== null && Number.isFinite(value) ? value : null;
  };
  const total = valueOf("계");
  return POP_BANDS.map(([band, label]) => {
    const value = valueOf(band);
    return {
      label,
      value,
      share: value !== null && total !== null && total > 0 ? (value / total) * 100 : null,
    };
  });
}

export async function fetchPopulationShares(apiKey: string, yearMonth: string) {
  const rows = await kosisFetch(apiKey, "DT_1DA7012S", yearMonth, yearMonth, 2);
  return populationShares(rows);
}

/** 기간 안의 월별 경제활동인구 구성비. 업로드 때 한 번만 호출합니다. */
export async function fetchPopulationByMonth(apiKey: string, start: string, end: string) {
  const rows = await kosisFetchRange(apiKey, "DT_1DA7012S", start, end, 2, 12);
  const months = [...new Set(rows.map((row) => row.PRD_DE))].filter(Boolean).sort();
  const byMonth = new Map<string, PopulationShare[]>();
  for (const month of months) {
    byMonth.set(month, populationShares(rows.filter((row) => row.PRD_DE === month)));
  }
  return byMonth;
}
