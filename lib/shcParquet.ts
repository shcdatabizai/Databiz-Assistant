import "server-only";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

// kosis_shc/scripts/update_shc.py의 aggregate_monthly() 로직을 이식.
// 원본 raw 컬럼: 기준년월, 대분류코드, 대분류, 중분류코드, 중분류, 소분류, 취급액, 개인취급액
const MEDICAL_MAJOR_CODE = "10";

export interface ShcMonthlyAgg {
  shcTotal: number;
  shcMedical: number;
  rowCount: number;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * 신한카드 raw parquet(ArrayBuffer)을 읽어 특정 기준년월(YYYYMM)의
 * 전체업종 취급액 합계와 의료(대분류코드=10) 취급액 합계를 집계합니다.
 * 파일에 여러 월이 섞여 있어도 yearMonth로 필터링합니다.
 */
export async function aggregateShcMonthly(
  buffer: ArrayBuffer,
  yearMonth: string
): Promise<ShcMonthlyAgg> {
  const rows = await parquetReadObjects({ file: buffer, compressors });

  let shcTotal = 0;
  let shcMedical = 0;
  let rowCount = 0;

  for (const row of rows) {
    const ym = toStr(row["기준년월"] ?? row["YM"] ?? row["ym"]);
    if (ym && ym !== yearMonth) continue;

    const amount = toNum(row["취급액"] ?? row["AMOUNT"] ?? row["amount"]);
    const majorCode = toStr(row["대분류코드"] ?? row["MAJOR_CODE"]);
    const majorName = toStr(row["대분류"] ?? row["MAJOR_NAME"]);

    shcTotal += amount;
    if (majorCode === MEDICAL_MAJOR_CODE || majorName === "의료") {
      shcMedical += amount;
    }
    rowCount += 1;
  }

  return { shcTotal: Math.round(shcTotal), shcMedical: Math.round(shcMedical), rowCount };
}
