import "server-only";

// kosis_shc/scripts/update_kosis.py 로직을 TypeScript로 이식.
const TBL_INDEX = "DT_1K41012"; // 재별 및 상품군별 소매판매액지수(2020=100.0)
const TBL_AMOUNT = "DT_1K41002"; // 재별 및 상품군별 판매액

interface KosisRow {
  C1_NM?: string;
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
      if (data.err === "20" && objLevels < 8) {
        return kosisFetch(apiKey, tblId, start, end, objLevels + 1);
      }
      throw new Error(`KOSIS API 오류 [${data.err}]: ${data.errMsg ?? JSON.stringify(data)}`);
    }
    throw new Error(`KOSIS 응답 형식이 예상과 다릅니다: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
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
