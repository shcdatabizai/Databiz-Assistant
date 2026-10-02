"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { FileText } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadProposal } from "@/lib/proposalDeck";

interface IndustrySeries {
  id: string;
  name: string;
  shc: (number | null)[];
  kosisAmount: (number | null)[];
  kosisIndex: (number | null)[];
}

interface DemoMonth {
  month: string;
  shinhan: { label: string; share: number | null }[];
  population: { label: string; share: number | null }[];
}

interface ComparePayload {
  months: string[];
  industries: IndustrySeries[];
  demos: DemoMonth[];
}

const RETAIL_URL = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1K41012&conn_path=I2";
const POPULATION_URL = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1DA7012S&conn_path=I2";
const COMPARE = "var(--chart-compare)";

function linePath(values: (number | null)[], scaleMax: number) {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null || scaleMax <= 0) {
      drawing = false;
      return;
    }
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 96 - (value / scaleMax) * 88;
    path += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    drawing = true;
  });
  return path;
}

function formatJo(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  const jo = value / 1_000_000;
  const digits = Math.abs(jo) >= 10 ? 1 : 2;
  return `${jo.toFixed(digits)}조`;
}

function TrendLines({
  shc,
  kosis,
  amounts,
  months,
  sameScale,
  ticks,
}: {
  shc: (number | null)[];
  kosis: (number | null)[];
  amounts: { shc: (number | null)[]; kosis: (number | null)[] };
  months: string[];
  sameScale: boolean;
  ticks: number[];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; top: number } | null>(null);
  const shcMax = Math.max(1, ...shc.map((value) => value ?? 0));
  const kosisMax = Math.max(1, ...kosis.map((value) => value ?? 0));
  const shared = Math.max(shcMax, kosisMax);
  const xAt = (index: number) => (shc.length <= 1 ? 0 : (index / (shc.length - 1)) * 100);
  const hoverLeft = hover ? xAt(hover.index) : 0;

  function onMove(event: MouseEvent<HTMLDivElement>) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || months.length === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (months.length - 1));
    setHover({ index, top: event.clientY - rect.top });
  }

  return (
    <div ref={boxRef} className="relative cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-56 w-full text-foreground" role="img" aria-label="신한카드와 KOSIS 추세">
        <style>{`
          @keyframes kosis-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
          .kosis-reveal { clip-path: inset(0 100% 0 0); animation: kosis-reveal 1.15s ease forwards; }
          .kosis-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
          .kosis-grid { stroke: currentColor; stroke-opacity: 0.28; stroke-width: 1; vector-effect: non-scaling-stroke; }
        `}</style>
        {ticks.map((index) => (
          <line key={index} className="kosis-grid" x1={xAt(index)} x2={xAt(index)} y1="4" y2="96" />
        ))}
        {hover ? <line className="kosis-grid" x1={hoverLeft} x2={hoverLeft} y1="4" y2="96" strokeOpacity={0.35} /> : null}
        <g className="kosis-reveal">
          <path className="kosis-line" stroke="#0046ff" d={linePath(shc, sameScale ? shared : shcMax)} />
          <path className="kosis-line" stroke={COMPARE} d={linePath(kosis, sameScale ? shared : kosisMax)} />
        </g>
      </svg>
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-[#0b2e6f] px-2.5 py-1.5 text-[11px] leading-relaxed text-white shadow-sm"
          style={{
            left: `${hoverLeft}%`,
            top: Math.max(4, hover.top - 62),
            transform: hoverLeft > 78 ? "translateX(-100%)" : hoverLeft < 18 ? "none" : "translateX(-50%)",
          }}
        >
          <p>{formatMonth(months[hover.index] ?? "")}</p>
          <p>SHC {formatJo(amounts.shc[hover.index] ?? null)}</p>
          <p>통계청 {formatJo(amounts.kosis[hover.index] ?? null)}</p>
        </div>
      ) : null}
    </div>
  );
}

function SourceLink({ kind }: { kind: "retail" | "population" }) {
  const item = kind === "retail"
    ? { href: RETAIL_URL, label: "통계청 소매판매액" }
    : { href: POPULATION_URL, label: "통계청 인구통계" };
  return (
    <a href={item.href} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-shinhan-blue hover:underline">
      <FileText className="size-3.5" />
      {item.label}
    </a>
  );
}

function axisTicks(months: string[]) {
  if (months.length === 0) return [];
  const short = months.length < 12;
  const indexes: number[] = [];
  if (short) {
    for (let index = 0; index < months.length; index += 3) indexes.push(index);
    const last = months.length - 1;
    if (indexes[indexes.length - 1] !== last) {
      if (last - indexes[indexes.length - 1] < 2) indexes[indexes.length - 1] = last;
      else indexes.push(last);
    }
  } else {
    let year = "";
    months.forEach((month, index) => {
      const next = month.slice(0, 4);
      if (next !== year) {
        indexes.push(index);
        year = next;
      }
    });
  }
  return indexes.map((index) => ({
    index,
    label: short ? formatMonth(months[index]) : months[index].slice(0, 4),
    left: months.length <= 1 ? 0 : (index / (months.length - 1)) * 100,
  }));
}

function InfoButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="설명"
        onClick={() => setOpen(true)}
        className="inline-flex size-5 items-center justify-center rounded-full border border-black/20 text-[11px] font-semibold leading-none text-black/50"
      >
        i
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>기준</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-black/70">{text}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatMonth(ym: string) {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function pearson(xs: number[], ys: number[]) {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function indexFrom202001(values: (number | null)[], months: string[]) {
  const baseAt = months.indexOf("202001");
  const base = baseAt >= 0 ? values[baseAt] : values.find((value) => value !== null && value !== 0);
  if (base === null || base === undefined || base === 0) return values.map(() => null);
  return values.map((value) => (value === null ? null : (value / base) * 100));
}

function shiftMonth(ym: string, delta: number) {
  const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(4)) - 1 + delta, 1);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function lastSharedRetailMonth(data: ComparePayload) {
  const total = data.industries.find((item) => item.id === "F01") ?? data.industries[0];
  if (!total) return data.months[data.months.length - 1] ?? "";
  for (let index = data.months.length - 1; index >= 0; index -= 1) {
    const shc = total.shc[index];
    const kosis = total.kosisAmount[index] ?? total.kosisIndex[index];
    if (shc != null && kosis != null) return data.months[index];
  }
  return data.months[data.months.length - 1] ?? "";
}

function lastSharedDemoMonth(demos: DemoMonth[], limit: string) {
  for (let index = demos.length - 1; index >= 0; index -= 1) {
    const item = demos[index];
    if (limit && item.month > limit) continue;
    const shinhan = item.shinhan.some((band) => band.share != null);
    const population = item.population.some((band) => band.share != null);
    if (shinhan && population) return item.month;
  }
  return demos[demos.length - 1]?.month ?? "";
}

function pairs(shc: (number | null)[], kosis: (number | null)[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  shc.forEach((value, index) => {
    const other = kosis[index];
    if (value !== null && other !== null) {
      xs.push(value);
      ys.push(other);
    }
  });
  return { xs, ys };
}

export default function KosisAnalysisPage() {
  const [data, setData] = useState<ComparePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [basis, setBasis] = useState<"amount" | "index">("amount");
  const [start, setStart] = useState("");
  const [industryId, setIndustryId] = useState("all");
  const [demoMonth, setDemoMonth] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalStart, setProposalStart] = useState("");
  const [proposalIds, setProposalIds] = useState<string[]>([]);
  const [proposalPop, setProposalPop] = useState(true);
  const [proposalDemo, setProposalDemo] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/kosis/compare")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        setData(body);
        setStart((prev) => prev || body.months?.[0] || "");
        setIndustryId((prev) => {
          const ids = (body.industries ?? []).map((item: IndustrySeries) => item.id);
          return ids.includes(prev) ? prev : ids[0] ?? "";
        });
        setDemoMonth(lastSharedDemoMonth(body.demos ?? [], lastSharedRetailMonth(body)));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const industry = data.industries.find((item) => item.id === industryId) ?? data.industries[0];
    if (!industry) return null;
    const endMonth = lastSharedRetailMonth(data);
    const endAt = data.months.indexOf(endMonth);
    const end = endAt < 0 ? data.months.length - 1 : endAt;
    const from = data.months.indexOf(start);
    let sliceFrom = from < 0 || from > end ? 0 : from;
    const shcFull = basis === "index" ? indexFrom202001(industry.shc, data.months) : industry.shc;
    const kosisFull = basis === "index" ? industry.kosisIndex : industry.kosisAmount;
    let sliceTo = end;
    if (sliceFrom > sliceTo) sliceFrom = Math.max(0, sliceTo);
    for (let index = end; index >= sliceFrom; index -= 1) {
      if (shcFull[index] != null && kosisFull[index] != null) {
        sliceTo = index;
        break;
      }
    }
    const months = data.months.slice(sliceFrom, sliceTo + 1);
    const shc = shcFull.slice(sliceFrom, sliceTo + 1);
    const kosis = kosisFull.slice(sliceFrom, sliceTo + 1);
    const shcAmount = industry.shc.slice(sliceFrom, sliceTo + 1);
    const kosisAmount = industry.kosisAmount.slice(sliceFrom, sliceTo + 1);
    const aligned = pairs(shc, kosis);
    const shcYoy = changeRate(industry.shc, data.months, 12).slice(sliceFrom, sliceTo + 1);
    const kosisYoy = changeRate(kosisFull, data.months, 12).slice(sliceFrom, sliceTo + 1);
    return {
      industry,
      months,
      shc,
      kosis,
      shcAmount,
      kosisAmount,
      correlation: pearson(aligned.xs, aligned.ys),
      n: aligned.xs.length,
      yoyDirection: directionMatch(shcYoy, kosisYoy),
    };
  }, [data, basis, start, industryId]);

  const sharedEnd = data ? lastSharedRetailMonth(data) : "";
  const monthOptions = data ? data.months.filter((month) => !sharedEnd || month <= sharedEnd) : [];
  const demoOptions = (data?.demos ?? []).filter((item) => {
    if (sharedEnd && item.month > sharedEnd) return false;
    return item.shinhan.some((band) => band.share != null) && item.population.some((band) => band.share != null);
  });

  const industryOptions = useMemo(() => {
    if (!data) return [];
    const scored = data.industries.map((item) => {
      const shc = indexFrom202001(item.shc, data.months);
      const aligned = pairs(shc, item.kosisIndex);
      return { ...item, correlation: pearson(aligned.xs, aligned.ys) };
    });
    return scored.filter((item) => item.correlation !== null && item.correlation >= 0.75);
  }, [data]);

  useEffect(() => {
    if (industryOptions.length === 0) return;
    if (!industryOptions.some((item) => item.id === industryId)) setIndustryId(industryOptions[0].id);
  }, [industryOptions, industryId]);

  const demoMonthShown = demoOptions.some((item) => item.month === demoMonth)
    ? demoMonth
    : demoOptions[demoOptions.length - 1]?.month ?? demoMonth;
  const demoView = data?.demos.find((item) => item.month === demoMonthShown) ?? data?.demos.at(-1) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 sm:py-12">
      <h1 className="text-xl font-bold sm:text-2xl">KOSIS-신한카드 정합성</h1>
      <p className="mt-2 text-sm leading-relaxed text-black/55">
        통계청 소매판매 및 인구통계자료와 신한카드 데이터를 비교해 정합성을 확인합니다.
        <SourceLink kind="retail" />
      </p>

      {loading ? <p className="mt-8 text-sm text-black/50">저장된 비교 데이터를 불러오는 중...</p> : null}
      {error ? <p className="mt-8 text-sm text-red-500">{error}</p> : null}

      {data && view ? (
        <>
          <div className="mt-6 grid grid-cols-3 items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-black/50">기준</span>
              <select
                value={basis}
                onChange={(event) => setBasis(event.target.value as "amount" | "index")}
                className="h-10 w-full min-w-0 rounded-lg border border-black/10 bg-white px-2 text-sm"
              >
                <option value="index">지수기준</option>
                <option value="amount">금액기준</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-black/50">시작월</span>
              <select value={start} onChange={(event) => setStart(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-black/10 bg-white px-2 text-sm">
                {monthOptions.map((month) => (
                  <option key={month} value={month}>{formatMonth(month)}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-black/50">업종</span>
              <select value={industryId} onChange={(event) => setIndustryId(event.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-black/10 bg-white px-2 text-sm">
                {industryOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#eef3ff] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-black/50">
                  {basis === "index" ? "추세 상관" : "금액 상관"} · {view.industry.name} · {view.n}개월
                </p>
                <InfoButton
                  text={
                    basis === "index"
                      ? "통계청 소매판매 경상지수(2020년=100)와, 신한카드 취급액을 2020년 1월=100으로 맞춘 값이 같이 움직이는 정도입니다. 1에 가까우면 오르고 내리는 흐름이 비슷하고, 0에 가까우면 거의 무관합니다. 금액이 얼마나 큰지는 보지 않습니다."
                      : "통계청 소매판매 금액과 신한카드 취급액이 같이 움직이는 정도입니다. 1에 가까우면 금액 흐름이 비슷합니다. 두 금액의 단위가 달라도 상관 계산에는 영향이 없습니다."
                  }
                />
              </div>
              <p className="mt-1 text-3xl font-bold text-[#0046ff]">
                {view.correlation === null ? "-" : view.correlation.toFixed(3)}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f3f4f6] px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-black/50">변화 방향 일치</p>
                <InfoButton text="전년 같은 달과 비교해, 통계청과 신한카드가 둘 다 늘었거나 둘 다 줄었는지를 센 비율입니다. 얼마나 많이 변했는지는 보지 않습니다." />
              </div>
              <p className="mt-1 text-3xl font-bold text-[#374151]">
                {view.yoyDirection === null ? "-" : `${view.yoyDirection.toFixed(0)}%`}
              </p>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-black/5 p-3">
            <div className="mb-2 flex gap-4 text-xs text-black/55">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#0046ff]" />신한카드</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[var(--chart-compare)]" />통계청</span>
            </div>
            <TrendLines
              key={`${basis}-${start}-${industryId}`}
              shc={view.shc}
              kosis={view.kosis}
              amounts={{ shc: view.shcAmount, kosis: view.kosisAmount }}
              months={view.months}
              sameScale={basis === "index"}
              ticks={axisTicks(view.months).map((tick) => tick.index)}
            />
            <div className="relative mt-1 h-4">
              {axisTicks(view.months).map((tick, tickIndex, ticks) => (
                <span
                  key={tick.label + tick.index}
                  className={`absolute top-0 text-[10px] text-black/40 ${tickIndex === 0 ? "" : tickIndex === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                  style={{ left: `${tick.left}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>

          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">인구 구성 비교</h2>
                <p className="mt-1 text-sm text-black/55">
                  신한카드 고객연령 구성비와 통계청 경제활동인구 대비 구성비를 비교합니다.
                  <SourceLink kind="population" />
                </p>
              </div>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-black/50">기준월</span>
                <select
                  value={demoMonthShown}
                  onChange={(event) => setDemoMonth(event.target.value)}
                  className="h-10 rounded-lg border border-black/10 bg-white px-3"
                >
                  {(demoOptions.length > 0 ? demoOptions : data.demos).map((item) => (
                    <option key={item.month} value={item.month}>{formatMonth(item.month)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-black/55">
              <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 bg-[#0046ff]" />신한카드</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 bg-[var(--chart-compare)]" />통계청</span>
            </div>
            <div className="mt-4 flex h-52 items-end justify-between gap-2">
              {(demoView?.shinhan ?? []).map((band, index) => {
                const pop = demoView?.population[index]?.share ?? 0;
                const maxShare = Math.max(
                  1,
                  ...(demoView?.shinhan ?? []).map((item) => item.share ?? 0),
                  ...(demoView?.population ?? []).map((item) => item.share ?? 0)
                );
                return (
                  <div key={band.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-40 w-full items-end justify-center gap-1">
                      <div className="w-3 rounded-t bg-[#0046ff] sm:w-5" style={{ height: `${((band.share ?? 0) / maxShare) * 100}%` }} />
                      <div className="w-3 rounded-t bg-[var(--chart-compare)] sm:w-5" style={{ height: `${(pop / maxShare) * 100}%` }} />
                    </div>
                    <span className="text-center text-[11px] text-black/55">{band.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 overflow-hidden rounded-xl border border-black/5">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f5f5f4] text-xs text-black/50">
                  <tr>
                    <th className="px-3 py-2">연령</th>
                    <th className="px-3 py-2">신한카드 구성비</th>
                    <th className="px-3 py-2">통계청 구성비</th>
                    <th className="px-3 py-2">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {(demoView?.shinhan ?? []).map((band, index) => {
                    const pop = demoView?.population[index]?.share ?? null;
                    const gap = band.share !== null && pop !== null ? band.share - pop : null;
                    return (
                      <tr key={band.label} className="border-t border-black/5">
                        <td className="px-3 py-2">{band.label}</td>
                        <td className="px-3 py-2">{band.share === null ? "-" : `${band.share.toFixed(1)}%`}</td>
                        <td className="px-3 py-2">{pop === null ? "-" : `${pop.toFixed(1)}%`}</td>
                        <td className="px-3 py-2">{gap === null ? "-" : `${gap > 0 ? "+" : ""}${gap.toFixed(1)}%p`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-10 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                const total = industryOptions.find((item) => item.id === "F01") ?? industryOptions[0];
                setProposalStart(start);
                setProposalIds(total ? [total.id] : []);
                setProposalPop(true);
                setProposalDemo(demoMonthShown);
                setProposalError(null);
                setProposalOpen(true);
              }}
            >
              제안용 페이지 생성
            </Button>
          </div>

          <Dialog open={proposalOpen} onOpenChange={setProposalOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>제안용 페이지</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <p className="text-xs leading-relaxed text-black/55">제안서용 ppt 자료를 생성합니다. 포함시킬 항목을 체크해주세요.</p>
                <label className="block">
                  <span className="mb-1 block text-xs text-black/50">소매판매액 기준월</span>
                  <select value={proposalStart} onChange={(event) => setProposalStart(event.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3">
                    {monthOptions.map((month) => (
                      <option key={month} value={month}>{formatMonth(month)}</option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend className="mb-2 text-xs text-black/50">포함 업종</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {industryOptions.map((item) => (
                      <label key={item.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={proposalIds.includes(item.id)}
                          onChange={(event) => {
                            setProposalIds((prev) => {
                              if (event.target.checked) return industryOptions.map((option) => option.id).filter((id) => id === item.id || prev.includes(id));
                              return prev.filter((id) => id !== item.id);
                            });
                          }}
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-black/50">인구통계</span>
                    <select
                      value={proposalPop ? "yes" : "no"}
                      onChange={(event) => setProposalPop(event.target.value === "yes")}
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3"
                    >
                      <option value="yes">포함</option>
                      <option value="no">불포함</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-black/50">인구 기준월</span>
                    <select
                      value={proposalDemo}
                      disabled={!proposalPop}
                      onChange={(event) => setProposalDemo(event.target.value)}
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 disabled:opacity-50"
                    >
                      {demoOptions.map((item) => (
                        <option key={item.month} value={item.month}>{formatMonth(item.month)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {proposalError ? <p className="text-sm text-red-500">{proposalError}</p> : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  disabled={proposalBusy || proposalIds.length === 0}
                  onClick={() => {
                    if (!data) return;
                    setProposalBusy(true);
                    setProposalError(null);
                    const demo = data.demos.find((item) => item.month === proposalDemo) ?? null;
                    downloadProposal({
                      months: data.months,
                      industries: data.industries.map((item) => ({
                        id: item.id,
                        name: item.name,
                        shc: item.shc,
                        kosisAmount: item.kosisAmount,
                      })),
                      selectedIds: proposalIds,
                      start: proposalStart,
                      includePopulation: proposalPop,
                      demo: proposalPop ? demo : null,
                    })
                      .then(() => setProposalOpen(false))
                      .catch((error: unknown) => setProposalError(error instanceof Error ? error.message : "제안서를 만들지 못했습니다."))
                      .finally(() => setProposalBusy(false));
                  }}
                >
                  {proposalBusy ? "만드는 중..." : "PPT 만들기"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
