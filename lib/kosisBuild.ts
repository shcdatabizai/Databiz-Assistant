import type { KosisRow, PopulationShare } from "@/lib/kosis";

export interface ShcFilter {
  major?: string;
  mid?: string;
  minor?: string;
}

export interface IndustryMatch {
  id: string;
  name: string;
  kosis: string[];
  indexMode: "official" | "amount";
  shc: ShcFilter[];
  all?: boolean;
}

/** 통계청 업종과 신한카드 분류를 맞춘 키. 화면과 저장이 같은 키를 씁니다. */
export const INDUSTRY_MATCHES: IndustryMatch[] = [
  { id: "F01", name: "전체", kosis: ["총지수"], indexMode: "official", shc: [], all: true },
  { id: "F02", name: "의약품/의료", kosis: ["의약품"], indexMode: "official", shc: [{ major: "의료" }] },
  { id: "F03", name: "화장품/미용", kosis: ["화장품"], indexMode: "official", shc: [{ major: "미용" }] },
  { id: "F04", name: "의복/의류잡화", kosis: ["의복"], indexMode: "official", shc: [{ major: "의류/잡화" }] },
  { id: "F05", name: "신발 및 가방", kosis: ["신발 및 가방"], indexMode: "official", shc: [{ major: "의류/잡화", mid: "패션/잡화", minor: "패션/잡화" }] },
  { id: "F06", name: "의복+신발", kosis: ["의복", "신발 및 가방"], indexMode: "amount", shc: [{ major: "의류/잡화" }] },
  { id: "F07", name: "승용차/자동차", kosis: ["승용차"], indexMode: "official", shc: [{ major: "자동차" }] },
  { id: "F08", name: "차량연료/주유", kosis: ["차량연료"], indexMode: "official", shc: [{ major: "주유" }] },
  { id: "F09", name: "가전제품", kosis: ["가전제품"], indexMode: "official", shc: [
    { major: "가전/가구", minor: "가전" },
    { major: "가전/가구", minor: "기타가전/가구" },
    { major: "가전/가구", minor: "컴퓨터/휴대폰" },
  ] },
  { id: "F10", name: "통신기기 및 컴퓨터", kosis: ["통신기기 및 컴퓨터"], indexMode: "official", shc: [{ major: "가전/가구", minor: "컴퓨터/휴대폰" }] },
  { id: "F11", name: "가구", kosis: ["가구"], indexMode: "official", shc: [{ major: "가전/가구", minor: "가구" }] },
  { id: "F12", name: "식음료(식료만)", kosis: ["음식료품"], indexMode: "official", shc: [{ major: "음/식료품" }] },
  { id: "F13", name: "레저/스포츠문화", kosis: ["오락, 취미, 경기용품"], indexMode: "official", shc: [
    { major: "스포츠/문화/레저", mid: "스포츠/문화/레저", minor: "취미/오락" },
    { mid: "스포츠/문화/레저용품", minor: "문화용품" },
    { mid: "스포츠/문화/레저용품", minor: "스포츠/레저용품" },
  ] },
  { id: "F14", name: "서적/문구", kosis: ["서적, 문구"], indexMode: "official", shc: [{ major: "스포츠/문화/레저", mid: "스포츠/문화/레저", minor: "서점" }] },
];

const AMOUNT_KEY = "SUM(HGA)/1000000";
const SHC_AGE = [
  ["AGE_2029", "20대"],
  ["AGE_3039", "30대"],
  ["AGE_4049", "40대"],
  ["AGE_5059", "50대"],
  ["AGE_60", "60세 이상"],
] as const;

export interface SeriesCell {
  shc: number | null;
  kosisAmount: number | null;
  kosisIndex: number | null;
}

export interface DemoCell {
  shinhan: { label: string; share: number | null }[];
  population: { label: string; share: number | null }[];
}

export interface MonthlyPoint {
  year_month: string;
  series: Record<string, SeriesCell>;
  demo: DemoCell;
}

function num(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number | null, digits = 4) {
  if (value === null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function monthsInAmountFile(rows: Record<string, string>[]) {
  return [...new Set(rows.map((row) => row.TA_YM).filter(Boolean))].sort();
}

function matchesFilter(row: Record<string, string>, filter: ShcFilter) {
  if (filter.major && row.LG_CAT_NM !== filter.major) return false;
  if (filter.mid && row.MD_CAT_NM !== filter.mid) return false;
  if (filter.minor && row.SML_CAT_NM !== filter.minor) return false;
  return true;
}

function seriesOf(
  rows: KosisRow[],
  months: string[],
  names: string[],
  options?: { totalIndex?: boolean; index?: boolean }
) {
  const wanted = new Set(names.map((name) => name.replace(/\s/g, "")));
  const officialIndex = Boolean(options?.index || options?.totalIndex);
  const useCurrentPrice = officialIndex && rows.some((row) => row.ITM_NM === "경상지수");
  const best = new Map<string, { value: number; rank: number }>();
  for (const row of rows) {
    if (useCurrentPrice && row.ITM_NM !== "경상지수") continue;
    const cat = (row.C1_NM || "").replace(/\s/g, "");
    let rank = 0;
    if (options?.totalIndex) {
      if (cat === "총지수") rank = 2;
      else if (cat === "합계") rank = 1;
      else continue;
    } else if (wanted.has(cat)) {
      rank = 1;
    } else continue;
    const value = num(row.DT);
    if (value === null) continue;
    const prev = best.get(row.PRD_DE);
    if (!prev || rank >= prev.rank) best.set(row.PRD_DE, { value, rank });
  }
  return months.map((month) => best.get(month)?.value ?? null);
}

function shcSeries(rows: Record<string, string>[], months: string[], filters: ShcFilter[], all = false) {
  return months.map((month) => {
    let sum = 0;
    let seen = false;
    for (const row of rows) {
      if (row.TA_YM !== month) continue;
      if (!all && !filters.some((filter) => matchesFilter(row, filter))) continue;
      const amount = num(row[AMOUNT_KEY]);
      if (amount === null) continue;
      sum += amount;
      seen = true;
    }
    return seen ? sum : null;
  });
}

function addSeries(months: string[], parts: (number | null)[][]) {
  return months.map((_, index) => {
    const values = parts.map((part) => part[index]).filter((value): value is number => value !== null);
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  });
}

function asIndex(values: (number | null)[], months: string[], baseOverride?: number | null) {
  const baseAt = months.indexOf("202001");
  const fromSeries = baseAt >= 0 ? values[baseAt] : null;
  const base = fromSeries ?? baseOverride ?? values.find((value) => value !== null && value !== 0);
  if (base === null || base === undefined || base === 0) return values.map(() => null);
  return values.map((value) => (value === null ? null : (value / base) * 100));
}

function demoForMonth(
  demoRows: Record<string, string>[],
  month: string,
  population: PopulationShare[] | undefined
) {
  const demoRow = demoRows.find((row) => row.TA_YM === month);
  const bands = SHC_AGE.map(([key, label]) => ({ label, count: demoRow ? num(demoRow[key]) : null }));
  const total = bands.reduce((sum, band) => sum + (band.count ?? 0), 0);
  return {
    shinhan: bands.map((band) => ({
      label: band.label,
      share: round(band.count !== null && total > 0 ? (band.count / total) * 100 : null),
    })),
    population: (population ?? []).map((band) => ({ label: band.label, share: round(band.share) })),
  };
}

/** 업종별 월 값을 한 달 한 행으로 묶습니다. */
export function buildMonthlyPoints(
  amtRows: Record<string, string>[],
  demoRows: Record<string, string>[],
  indexRows: KosisRow[],
  amountRows: KosisRow[],
  populationByMonth: Map<string, PopulationShare[]>,
  f06Base?: number | null
): MonthlyPoint[] {
  const months = monthsInAmountFile(amtRows);
  const built = INDUSTRY_MATCHES.map((match) => {
    const amountParts = match.kosis.map((name) => seriesOf(amountRows, months, [name]));
    const kosisAmount = match.id === "F01" ? seriesOf(amountRows, months, ["합계"]) : addSeries(months, amountParts);
    const kosisIndex = match.indexMode === "amount"
      ? asIndex(kosisAmount, months, f06Base)
      : seriesOf(indexRows, months, match.kosis, match.id === "F01" ? { totalIndex: true } : { index: true });
    return {
      id: match.id,
      shc: shcSeries(amtRows, months, match.shc, match.all),
      kosisAmount,
      kosisIndex,
    };
  });

  return months.map((month, index) => {
    const series: Record<string, SeriesCell> = {};
    for (const item of built) {
      series[item.id] = {
        shc: round(item.shc[index], 3),
        kosisAmount: round(item.kosisAmount[index], 3),
        kosisIndex: round(item.kosisIndex[index], 3),
      };
    }
    return {
      year_month: month,
      series,
      demo: demoForMonth(demoRows, month, populationByMonth.get(month)),
    };
  });
}
