import type PptxGenJS from "pptxgenjs";

export interface ProposalIndustry {
  id: string;
  name: string;
  shc: (number | null)[];
  kosisAmount: (number | null)[];
}

export interface ProposalBand {
  label: string;
  share: number | null;
}

export interface ProposalDemo {
  month: string;
  shinhan: ProposalBand[];
  population: ProposalBand[];
}

export interface ProposalRequest {
  months: string[];
  industries: ProposalIndustry[];
  selectedIds: string[];
  start: string;
  includePopulation: boolean;
  demo: ProposalDemo | null;
}

interface ChartSeries {
  name: string;
  months: string[];
  shc: (number | null)[];
  kosis: (number | null)[];
  correlation: number | null;
  direction: number | null;
}

const FONT = "OneShinhan Medium";
const FONT_BOLD = "OneShinhan Bold";
const BLUE = "0046FF";
const NAVY = "0B2E6F";
const GRAY = "7A88A6";
const LINE = "9CA3AF";
const SOFT = "F2F6FF";

const u = (value: number) => (value / 680) * 13.333;
const pt = (size: number) => Math.round(size * 1.408 * 10) / 10;

function formatMonth(ym: string) {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function shiftMonth(ym: string, delta: number) {
  const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(4)) - 1 + delta, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function pearson(xs: number[], ys: number[]) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const a = xs[index] - mx;
    const b = ys[index] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function changeRate(values: (number | null)[], months: string[], lag: number) {
  return values.map((value, index) => {
    if (value === null) return null;
    const previous = months.indexOf(shiftMonth(months[index], -lag));
    const base = previous >= 0 ? values[previous] : null;
    if (base === null || base === 0) return null;
    return ((value - base) / base) * 100;
  });
}

function directionMatch(left: (number | null)[], right: (number | null)[]) {
  let same = 0;
  let total = 0;
  left.forEach((value, index) => {
    const other = right[index];
    if (value === null || other === null || value === 0 || other === 0) return;
    total += 1;
    if (Math.sign(value) === Math.sign(other)) same += 1;
  });
  return total === 0 ? null : (same / total) * 100;
}

function lastSharedMonth(months: string[], industries: ProposalIndustry[]) {
  const total = industries.find((item) => item.id === "F01") ?? industries[0];
  if (!total) return months[months.length - 1] ?? "";
  for (let index = months.length - 1; index >= 0; index -= 1) {
    if (total.shc[index] != null && total.kosisAmount[index] != null) return months[index];
  }
  return months[months.length - 1] ?? "";
}

function buildSeries(industry: ProposalIndustry, months: string[], start: string, sharedEnd: string): ChartSeries {
  const endAt = months.indexOf(sharedEnd);
  const end = endAt < 0 ? months.length - 1 : endAt;
  const from = months.indexOf(start);
  let sliceFrom = from < 0 || from > end ? 0 : from;
  let sliceTo = end;
  if (sliceFrom > sliceTo) sliceFrom = Math.max(0, sliceTo);
  for (let index = end; index >= sliceFrom; index -= 1) {
    if (industry.shc[index] != null && industry.kosisAmount[index] != null) {
      sliceTo = index;
      break;
    }
  }
  const sliceMonths = months.slice(sliceFrom, sliceTo + 1);
  const shc = industry.shc.slice(sliceFrom, sliceTo + 1);
  const kosis = industry.kosisAmount.slice(sliceFrom, sliceTo + 1);
  const xs: number[] = [];
  const ys: number[] = [];
  shc.forEach((value, index) => {
    const other = kosis[index];
    if (value !== null && other !== null) {
      xs.push(value);
      ys.push(other);
    }
  });
  const shcYoy = changeRate(industry.shc, months, 12).slice(sliceFrom, sliceTo + 1);
  const kosisYoy = changeRate(industry.kosisAmount, months, 12).slice(sliceFrom, sliceTo + 1);
  return {
    name: industry.name,
    months: sliceMonths,
    shc,
    kosis,
    correlation: pearson(xs, ys),
    direction: directionMatch(shcYoy, kosisYoy),
  };
}

function corrText(value: number | null) {
  return value === null ? "-" : value.toFixed(3);
}

function dirText(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function joText(value: number) {
  const jo = value / 1_000_000;
  const digits = Math.abs(jo) >= 10 ? 1 : 2;
  return `${jo.toFixed(digits)}조`;
}

function rangeText(values: (number | null)[]) {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (nums.length === 0) return "-";
  return `${joText(Math.min(...nums))}–${joText(Math.max(...nums))}`;
}

function peakOf(values: number[]) {
  return Math.max(...values, 0) || 1;
}

type Slide = ReturnType<PptxGenJS["addSlide"]>;

function addText(
  slide: Slide,
  x: number,
  y: number,
  text: string,
  size: number,
  color: string,
  options?: { bold?: boolean; align?: "left" | "right" | "center"; w?: number }
) {
  const width = options?.w ?? 260;
  const align = options?.align ?? "left";
  const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  slide.addText(text, {
    x: u(left),
    y: u(y - size * 1.2),
    w: u(width),
    h: u(size * 1.7),
    fontFace: options?.bold ? FONT_BOLD : FONT,
    fontSize: pt(size),
    color,
    align,
    margin: 0,
    wrap: false,
  });
}

function addFrame(slide: Slide, num: string, total: string, title: string) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: u(680),
    h: u(383),
    fill: { color: "FFFFFF" },
    line: { color: "C9D6F0", width: 0.75 },
  });
  slide.addShape("rect", { x: 0, y: 0, w: u(680), h: u(44), fill: { color: BLUE } });
  addText(slide, 28, 31, num, 20, "FFFFFF", { bold: true, w: 44 });
  addText(slide, 62, 31, `/ ${total}`, 11, "8FB2FF", { w: 50 });
  addText(slide, 112, 30, title, 15, "FFFFFF", { bold: true, w: 460 });
}

const HEAD_LINE = "국내 소비 트렌드의 가장 정확한 지표, 신한카드 데이터";
const HEAD_SUB = "신한카드 결제 데이터는 국내 소비를 대변하는 가장 강력하고 대표성 높은 지표입니다.";

function addHead(slide: Slide) {
  slide.addShape("rect", { x: u(28), y: u(56), w: u(4), h: u(34), fill: { color: BLUE } });
  addText(slide, 42, 70, HEAD_LINE, 14, NAVY, { bold: true, w: 610 });
  addText(slide, 42, 88, HEAD_SUB, 11, "5A6478", { w: 610 });
}

function addLegend(slide: Slide, x: number, y: number) {
  slide.addShape("rect", { x: u(x), y: u(y - 6), w: u(8), h: u(8), fill: { color: LINE } });
  addText(slide, x + 12, y + 2, "통계청 (우축)", 10, "5A6478", { w: 78 });
  slide.addShape("rect", { x: u(x + 96), y: u(y - 6), w: u(8), h: u(8), fill: { color: BLUE } });
  addText(slide, x + 108, y + 2, "신한카드 (좌축)", 10, "5A6478", { w: 90 });
}

function addShareLegend(slide: Slide, x: number, y: number) {
  slide.addShape("rect", { x: u(x), y: u(y - 6), w: u(8), h: u(8), fill: { color: BLUE } });
  addText(slide, x + 12, y + 2, "신한카드", 10, "5A6478", { w: 52 });
  slide.addShape("rect", { x: u(x + 70), y: u(y - 6), w: u(8), h: u(8), fill: { color: LINE } });
  addText(slide, x + 82, y + 2, "통계청", 10, "5A6478", { w: 48 });
}

function addNotes(slide: Slide, lines: string[]) {
  lines.slice(0, 2).forEach((line, index) => {
    addText(slide, 28, 362 + index * 14, line, 10, GRAY, { w: 624 });
  });
}

function pairedPoints(series: ChartSeries) {
  const months: string[] = [];
  const shc: number[] = [];
  const kosis: number[] = [];
  series.shc.forEach((value, index) => {
    const other = series.kosis[index];
    if (value == null || other == null || !Number.isFinite(value) || !Number.isFinite(other)) return;
    months.push(series.months[index] ?? "");
    shc.push(value);
    kosis.push(other);
  });
  return { months, shc, kosis };
}

function axisNum(value: number) {
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

function addSegment(slide: Slide, x1: number, y1: number, x2: number, y2: number, color: string) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
  if (Math.abs(dy) < 0.8) {
    slide.addShape("rect", {
      x: u(Math.min(x1, x2)),
      y: u((y1 + y2) / 2 - 0.45),
      w: u(Math.max(Math.abs(dx), 0.4)),
      h: u(0.9),
      fill: { color },
    });
    return;
  }
  slide.addShape("line", {
    x: u(Math.min(x1, x2)),
    y: u(Math.min(y1, y2)),
    w: u(Math.max(Math.abs(dx), 0.4)),
    h: u(Math.abs(dy)),
    line: { color, width: 1.25 },
    flipV: dx >= 0 ? dy < 0 : dy > 0,
  });
}

function addDualChart(slide: Slide, _pptx: PptxGenJS, series: ChartSeries, x: number, y: number, w: number, h: number) {
  const points = pairedPoints(series);
  if (points.months.length < 2) {
    addText(slide, x, y + 24, "비교할 금액 자료가 없습니다.", 11, GRAY, { w });
    return;
  }
  const yearly = points.months.length >= 12;
  const shcJo = points.shc.map((value) => value / 1_000_000);
  const kosisJo = points.kosis.map((value) => value / 1_000_000);
  const shcPeak = peakOf(shcJo);
  const kosisPeak = peakOf(kosisJo);
  const padL = 26;
  const padR = 26;
  const padB = 14;
  const plotX = x + padL;
  const plotW = Math.max(20, w - padL - padR);
  const plotY = y + 2;
  const plotH = Math.max(16, h - padB);
  const xAt = (index: number) => plotX + (index / (points.months.length - 1)) * plotW;
  const yAt = (value: number, peak: number) => plotY + plotH * (0.96 - (value / peak) * 0.88);
  slide.addShape("rect", {
    x: u(plotX),
    y: u(plotY + plotH),
    w: u(plotW),
    h: u(0.6),
    fill: { color: "E1E8F5" },
  });
  const labelIndexes: number[] = [];
  if (yearly) {
    let year = "";
    points.months.forEach((month, index) => {
      const next = month.slice(0, 4);
      if (next !== year) {
        labelIndexes.push(index);
        year = next;
      }
    });
  } else {
    for (let index = 0; index < points.months.length; index += 3) labelIndexes.push(index);
  }
  labelIndexes.forEach((index) => {
    const gx = xAt(index);
    slide.addShape("rect", {
      x: u(gx),
      y: u(plotY),
      w: u(0.45),
      h: u(plotH),
      fill: { color: "EEF2F7" },
    });
    addText(slide, gx, plotY + plotH + 12, yearly ? points.months[index].slice(0, 4) : formatMonth(points.months[index]), 8, "B4BDCE", {
      align: "center",
      w: 36,
    });
  });
  for (let index = 1; index < shcJo.length; index += 1) {
    addSegment(slide, xAt(index - 1), yAt(shcJo[index - 1], shcPeak), xAt(index), yAt(shcJo[index], shcPeak), BLUE);
    addSegment(slide, xAt(index - 1), yAt(kosisJo[index - 1], kosisPeak), xAt(index), yAt(kosisJo[index], kosisPeak), LINE);
  }
  [shcPeak, shcPeak / 2, 0].forEach((value) => {
    addText(slide, x + 24, yAt(value, shcPeak) + 3, axisNum(value), 8, BLUE, { align: "right", w: 24 });
  });
  [kosisPeak, kosisPeak / 2, 0].forEach((value) => {
    addText(slide, plotX + plotW + 2, yAt(value, kosisPeak) + 3, axisNum(value), 8, "6B7280", { w: 24 });
  });
}

function addMetricPills(slide: Slide, x: number, y: number, width: number, correlation: number | null, direction: number | null) {
  const gap = 6;
  const boxW = Math.min(118, (width - gap) / 2);
  const boxes = [
    { title: "상관", value: corrText(correlation), fill: "E6EEFF", color: BLUE },
    { title: "방향", value: dirText(direction), fill: "F3F4F6", color: "374151" },
  ];
  boxes.forEach((box, index) => {
    const left = x + index * (boxW + gap);
    slide.addShape("roundRect", {
      x: u(left),
      y: u(y),
      w: u(boxW),
      h: u(24),
      fill: { color: box.fill },
      rectRadius: 0.16,
    });
    addText(slide, left + 8, y + 16, box.title, 10, "5A6478", { w: boxW * 0.4 });
    addText(slide, left + boxW - 8, y + 17, box.value, 12, box.color, { bold: true, align: "right", w: boxW * 0.55 });
  });
}

function addChartBlock(slide: Slide, pptx: PptxGenJS, series: ChartSeries, x: number, y: number, w: number, h: number, mark: string) {
  addText(slide, x, y + 11, `${mark} ${series.name}`, 11, BLUE, { bold: true, w: w >= 500 ? w * 0.45 : w });
  if (w >= 500) addText(slide, x + w, y + 11, `좌 ${rangeText(series.shc)} · 우 ${rangeText(series.kosis)}`, 9, "B4BDCE", { align: "right", w: w * 0.55 });
  addMetricPills(slide, x, y + 16, w, series.correlation, series.direction);
  addDualChart(slide, pptx, series, x, y + 44, w, Math.max(28, h - 46));
}

function addMetricCard(slide: Slide, x: number, y: number, w: number, h: number, title: string, value: string, desc: string) {
  slide.addShape("roundRect", {
    x: u(x),
    y: u(y),
    w: u(w),
    h: u(h),
    fill: { color: SOFT },
    rectRadius: 0.08,
  });
  if (w >= 220) {
    addText(slide, x + 16, y + 32, title, 13, NAVY, { bold: true, w: w - 110 });
    addText(slide, x + w - 16, y + 36, value, 20, BLUE, { bold: true, align: "right", w: 96 });
  } else {
    addText(slide, x + 12, y + 20, title, 11, NAVY, { bold: true, w: w - 24 });
    addText(slide, x + 12, y + 44, value, 18, BLUE, { bold: true, w: w - 24 });
  }
  addText(slide, x + 16, y + h - 16, desc, 10, GRAY, { w: w - 32 });
}

function addPopulationColumn(slide: Slide, pptx: PptxGenJS, demo: ProposalDemo, x: number, y: number, w: number, h: number) {
  addText(slide, x, y + 12, `인구 구성비 · ${formatMonth(demo.month)}`, 11, BLUE, { bold: true, w });
  const chartH = Math.max(88, Math.round(h * 0.46));
  addPopulationChart(slide, pptx, demo, x, y + 18, w, chartH);
  addPopulationTable(slide, demo, x, y + 18 + chartH + 14, w);
}

function addPopulationChart(slide: Slide, _pptx: PptxGenJS, demo: ProposalDemo, x: number, y: number, w: number, h: number) {
  const shc = demo.shinhan.map((band) => band.share ?? 0);
  const pop = demo.population.map((band) => band.share ?? 0);
  const max = Math.max(1, ...shc, ...pop);
  const count = Math.max(demo.shinhan.length, 1);
  const slot = w / count;
  const barW = Math.min(8, slot * 0.18);
  const plotH = Math.max(20, h - 16);
  demo.shinhan.forEach((band, index) => {
    const center = x + slot * index + slot / 2;
    const shcH = (shc[index] / max) * plotH;
    const popH = ((pop[index] ?? 0) / max) * plotH;
    if (shcH > 0.4) {
      slide.addShape("rect", {
        x: u(center - barW - 0.8),
        y: u(y + plotH - shcH),
        w: u(barW),
        h: u(shcH),
        fill: { color: BLUE },
      });
    }
    if (popH > 0.4) {
      slide.addShape("rect", {
        x: u(center + 0.8),
        y: u(y + plotH - popH),
        w: u(barW),
        h: u(popH),
        fill: { color: LINE },
      });
    }
    addText(slide, center, y + plotH + 12, band.label, 9, "5A6478", { align: "center", w: slot });
  });
}

function addPopulationTable(slide: Slide, demo: ProposalDemo, x: number, y: number, width = 240) {
  const headers = ["연령", "신한카드", "통계청", "차이"];
  const widths = [width * 0.28, width * 0.24, width * 0.24, width * 0.24];
  headers.forEach((header, index) => {
    const left = x + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
    addText(slide, left, y, header, 10, GRAY, { w: widths[index], align: index === 0 ? "left" : "right" });
  });
  slide.addShape("rect", { x: u(x), y: u(y + 6), w: u(width), h: u(1), fill: { color: "E1E8F5" } });
  demo.shinhan.forEach((band, row) => {
    const pop = demo.population[row]?.share ?? null;
    const gap = band.share != null && pop != null ? band.share - pop : null;
    const cells = [
      band.label,
      band.share == null ? "-" : `${band.share.toFixed(1)}%`,
      pop == null ? "-" : `${pop.toFixed(1)}%`,
      gap == null ? "-" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}%p`,
    ];
    const rowY = y + 24 + row * 18;
    cells.forEach((cell, index) => {
      const left = x + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
      addText(slide, left, rowY, cell, 11, index === 0 ? NAVY : "3D4A66", {
        w: widths[index],
        align: index === 0 ? "left" : "right",
        bold: index === 0,
      });
    });
  });
}

function periodNote(series: ChartSeries) {
  const start = series.months[0] ?? "";
  const end = series.months[series.months.length - 1] ?? "";
  return `※ 금액기준 · ${formatMonth(start)}–${formatMonth(end)} · 단위 조 · 좌축 신한카드, 우축 통계청`;
}

function metricNote() {
  return "※ 상관계수는 금액 흐름의 유사도, 변화방향 일치는 전년 동월 증감 방향이 같은 비율";
}

function populationNote(month: string) {
  return `※ 인구 구성비 ${formatMonth(month)} · 신한카드 고객연령 / 통계청 경제활동인구`;
}

function pageNo(index: number, total: number) {
  return { num: String(index + 1).padStart(2, "0"), total: String(total).padStart(2, "0") };
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

export async function buildProposal(request: ProposalRequest) {
  const selected = request.selectedIds
    .map((id) => request.industries.find((item) => item.id === id))
    .filter((item): item is ProposalIndustry => Boolean(item));
  if (selected.length === 0) throw new Error("업종을 하나 이상 선택해 주세요.");
  if (request.includePopulation && !request.demo) throw new Error("인구통계 기준월 자료가 없습니다.");

  const sharedEnd = lastSharedMonth(request.months, request.industries);
  const charts = selected.map((item) => buildSeries(item, request.months, request.start, sharedEnd));
  const withPopulation = request.includePopulation && request.demo != null;
  const trendPages = charts.length <= 2 ? [charts] : chunk(charts, 4);
  const total = trendPages.length + (withPopulation && charts.length >= 3 ? 1 : 0);
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "SHINHAN", width: 13.333, height: 7.5 });
  pptx.layout = "SHINHAN";
  pptx.theme = { headFontFace: FONT_BOLD, bodyFontFace: FONT };
  pptx.title = "데이터 정합성";

  trendPages.forEach((page, pageIndex) => {
    const slide = pptx.addSlide();
    const no = pageNo(pageIndex, total);
    addFrame(slide, no.num, no.total, "데이터 정합성");
    addHead(slide);
    const notes = [periodNote(page[0]), withPopulation && request.demo ? populationNote(request.demo.month) : metricNote()];
    const populationOnSlide = withPopulation && charts.length < 3 && request.demo != null;
    if (!populationOnSlide) addLegend(slide, 470, 112);

    if (page.length === 1 && charts.length === 1 && !withPopulation) {
      const series = page[0];
      addMetricCard(slide, 28, 118, 248, 100, "상관계수", corrText(series.correlation), "통계청·신한카드 금액이 같이 움직이는 정도");
      addMetricCard(slide, 28, 228, 248, 100, "변화방향 일치", dirText(series.direction), "전년 동월 대비 증감 방향이 같은 달의 비율");
      addText(slide, 292, 128, series.name, 11, BLUE, { bold: true, w: 160 });
      addText(slide, 652, 128, `좌 ${rangeText(series.shc)} · 우 ${rangeText(series.kosis)}`, 10, "B4BDCE", { align: "right", w: 250 });
      addDualChart(slide, pptx, series, 292, 136, 360, 200);
    } else if (charts.length === 1 && populationOnSlide && request.demo) {
      const series = page[0];
      addMetricCard(slide, 28, 112, 176, 88, "상관계수", corrText(series.correlation), "금액이 같이 움직이는 정도");
      addMetricCard(slide, 212, 112, 176, 88, "방향일치", dirText(series.direction), "증감 방향이 같은 달의 비율");
      addText(slide, 28, 214, series.name, 11, BLUE, { bold: true, w: 160 });
      addLegend(slide, 250, 214);
      addDualChart(slide, pptx, series, 28, 224, 360, 116);
      addPopulationColumn(slide, pptx, request.demo, 404, 112, 248, 228);
    } else if (charts.length === 2 && populationOnSlide && request.demo) {
      page.forEach((series, index) => {
        addChartBlock(slide, pptx, series, 28, 112 + index * 112, 360, 106, index === 0 ? "①" : "②");
      });
      addPopulationColumn(slide, pptx, request.demo, 404, 112, 248, 228);
    } else if (charts.length === 2) {
      page.forEach((series, index) => {
        addChartBlock(slide, pptx, series, 28, 112 + index * 118, 624, 112, index === 0 ? "①" : "②");
      });
    } else {
      const cols = 2;
      const rows = Math.ceil(page.length / cols);
      const cellW = (624 - 16) / cols;
      const cellH = (236 - 8 * (rows - 1)) / rows;
      page.forEach((series, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const mark = String.fromCharCode(0x2460 + pageIndex * 4 + index);
        addChartBlock(slide, pptx, series, 28 + col * (cellW + 16), 112 + row * (cellH + 8), cellW, cellH, mark);
      });
    }
    addNotes(slide, notes);
  });

  if (withPopulation && charts.length >= 3 && request.demo) {
    const slide = pptx.addSlide();
    const no = pageNo(total - 1, total);
    addFrame(slide, no.num, no.total, "데이터 정합성");
    addHead(slide);
    addText(slide, 28, 118, `인구 구성비 · ${formatMonth(request.demo.month)}`, 11, BLUE, { bold: true, w: 240 });
    addShareLegend(slide, 280, 118);
    addPopulationChart(slide, pptx, request.demo, 28, 140, 360, 190);
    addPopulationTable(slide, request.demo, 412, 156, 240);
    addNotes(slide, [populationNote(request.demo.month), periodNote(charts[0])]);
  }

  return pptx;
}

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function downloadProposal(request: ProposalRequest) {
  const pptx = await buildProposal(request);
  const fileName = `데이터정합성_${formatMonth(request.start)}.pptx`;
  const raw = (await pptx.write({ outputType: "blob" })) as Blob;
  const file = new File([raw], fileName, { type: PPTX_MIME });
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let canShare = false;
  try {
    canShare = mobile && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    canShare = false;
  }
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: "데이터 정합성" });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
