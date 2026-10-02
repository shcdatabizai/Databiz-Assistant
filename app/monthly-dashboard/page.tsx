"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MetricRow {
  year_month: string;
  payload: Record<string, unknown> | null;
  row_count: number | null;
  computed_at: string | null;
}

interface UploadRow {
  year_month: string;
  status: string;
  drive_file_name: string | null;
  error_message: string | null;
}

interface Series {
  labels: string[];
  current: number[];
  prev: number[];
  yoy: number[];
}

function formatMonth(ym: string) {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numbers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));
}

function labelsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (item == null ? "" : String(item)));
}

function seriesFromRows(value: unknown): Series | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isRecord)) return null;
  const labels = value.map((row) => String(row["구분"] ?? ""));
  if (!labels.some(Boolean)) return null;
  return {
    labels,
    current: value.map((row) => (typeof row["당월(억원)"] === "number" ? row["당월(억원)"] : 0)),
    prev: value.map((row) => (typeof row["전년(억원)"] === "number" ? row["전년(억원)"] : 0)),
    yoy: value.map((row) => (typeof row["전년비(%)"] === "number" ? row["전년비(%)"] : 0)),
  };
}

function seriesFrom(source: Record<string, unknown> | null, keys: { labels: string; current: string; prev?: string; yoy?: string }): Series | null {
  if (!source) return null;
  const labels = labelsOf(source[keys.labels]);
  if (labels.length === 0) return null;
  return {
    labels,
    current: numbers(source[keys.current]),
    prev: keys.prev ? numbers(source[keys.prev]) : [],
    yoy: keys.yoy ? numbers(source[keys.yoy]) : [],
  };
}

function formatNum(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatYoy(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function yoyClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-foreground";
  return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
}

function Legend({ items }: { items: { label: string; swatch: string; line?: boolean }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={item.line ? `inline-block h-0.5 w-4 ${item.swatch}` : `inline-block size-2.5 rounded-sm ${item.swatch}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ColumnChart({
  labels,
  current,
  prev,
  line,
  amountAxis = true,
  fit = false,
}: {
  labels: string[];
  current: number[];
  prev?: number[];
  line?: number[];
  amountAxis?: boolean;
  fit?: boolean;
}) {
  const count = labels.length;
  const hasPrev = !!prev && prev.some((value) => value !== 0);
  const hasLine = !!line && line.length > 0;
  const barValues = [...current, ...(hasPrev && prev ? prev : [])];
  const barMin = Math.min(0, ...barValues);
  const barMax = Math.max(0, ...barValues, 1);
  const barSpan = barMax - barMin || 1;
  const lineValues = hasLine && line ? line : [];
  const lineMin = hasLine ? Math.min(0, ...lineValues) : 0;
  const lineMax = hasLine ? Math.max(0, ...lineValues) : 1;
  const lineSpan = lineMax - lineMin || 1;
  const width = fit ? 720 : Math.max(720, count * (hasPrev ? 56 : 40));
  const padL = 46;
  const padR = hasLine ? 46 : 16;
  const padT = 12;
  const plotH = 210;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 1);
  const labelDrop = fit ? 4 : Math.ceil(longest * 11 * Math.sin((40 * Math.PI) / 180) + 18);
  const fitLabelH = Math.ceil(longest * 11 * Math.sin((40 * Math.PI) / 180) + 2);
  const height = padT + plotH + labelDrop;
  const labelY = padT + plotH + 16;
  const plotW = width - padL - padR;
  const slot = plotW / Math.max(count, 1);
  const barW = Math.min(fit ? 46 : 20, slot * (hasPrev ? 0.4 : 0.62));
  const [hover, setHover] = useState<number | null>(null);
  const yoyAt = (index: number) => {
    if (line && index < line.length) return line[index];
    const before = prev?.[index];
    if (before) return ((current[index] - before) / before) * 100;
    if (!amountAxis) return current[index] ?? null;
    return null;
  };
  const yBar = (value: number) => padT + plotH - ((value - barMin) / barSpan) * plotH;
  const yLine = (value: number) => padT + plotH - ((value - lineMin) / lineSpan) * plotH;
  const zero = yBar(0);
  const ticks = [barMax, barMin + barSpan / 2, barMin];

  function bar(x: number, value: number, fill: string, key: string) {
    const y = yBar(value);
    const top = Math.min(y, zero);
    const h = Math.max(1, Math.abs(zero - y));
    return <rect key={key} x={x} y={top} width={barW} height={h} rx={3} fill={fill} />;
  }

  const linePath = hasLine
    ? lineValues
        .map((value, index) => {
          const x = padL + slot * (index + 0.5);
          return `${index === 0 ? "M" : "L"}${x},${yLine(value)}`;
        })
        .join(" ")
    : "";

  return (
    <div className={fit ? undefined : "overflow-x-auto pb-1"}>
      <div className={fit ? "relative w-full" : "relative"} style={fit ? undefined : { width }}>
      <svg viewBox={`0 0 ${width} ${height}`} className={`text-muted-foreground ${fit ? "h-auto w-full" : ""}`} style={fit ? undefined : { width, height }} role="img">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padL} x2={width - padR} y1={yBar(tick)} y2={yBar(tick)} stroke="currentColor" strokeOpacity={0.2} />
            <text x={padL - 6} y={yBar(tick) + 3} textAnchor="end" fontSize={10} fill="currentColor">
              {amountAxis ? formatNum(tick) : formatYoy(tick)}
            </text>
          </g>
        ))}
        {hasLine ? (
          <text x={width - 6} y={padT + 8} textAnchor="end" fontSize={10} fill="currentColor">
            {formatYoy(lineMax)}
          </text>
        ) : null}
        <line x1={padL} x2={width - padR} y1={zero} y2={zero} stroke="currentColor" strokeOpacity={0.45} />
        {labels.map((label, index) => {
          const center = padL + slot * (index + 0.5);
          const currentFill = "#0046ff";
          return (
            <g key={`${label}-${index}`}>
              {hasPrev && prev ? bar(center - barW - 1, prev[index] ?? 0, PREV_BAR, "prev") : null}
              {bar(hasPrev ? center + 1 : center - barW / 2, current[index] ?? 0, currentFill, "cur")}
              <rect
                x={padL + slot * index}
                y={padT}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              />
              {fit ? null : (
                <text
                  x={center}
                  y={labelY}
                  textAnchor="end"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-40 ${center} ${labelY})`}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {hasLine && Math.abs(yLine(0) - zero) > 1 ? (
          <line x1={padL} x2={width - padR} y1={yLine(0)} y2={yLine(0)} stroke="#f59e0b" strokeDasharray="4 3" strokeOpacity={0.8} />
        ) : null}
        {hasLine ? <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth={3} pointerEvents="none" /> : null}
      </svg>
      {fit ? (
        <div className="relative" style={{ height: fitLabelH }}>
          {labels.map((label, index) => (
            <div key={`${label}-${index}`} className="absolute top-0" style={{ left: `${((padL + slot * (index + 0.5)) / width) * 100}%` }}>
              <span className="absolute top-0 right-0 origin-top-right -rotate-[40deg] whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {hover !== null ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-[#0b2e6f] px-2.5 py-1.5 text-[11px] leading-relaxed text-white shadow-sm"
          style={{ left: `${((padL + slot * (hover + 0.5)) / width) * 100}%`, top: 4 }}
        >
          <p>{labels[hover]}</p>
          <p>전년비 {formatYoy(yoyAt(hover))}</p>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function KpiCard({ label, yoy, current, previous }: { label: string; yoy: number | null; current: string; previous: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-2 py-3 sm:px-4">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tracking-tight sm:text-2xl ${yoyClass(yoy)}`}>{formatYoy(yoy)}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
        <span className="block">(당월) {current}</span>
        <span className="block">(전년) {previous}</span>
      </p>
    </div>
  );
}

type IndustrySortKey = "ry_nm" | "est_amt" | "est_amt_bf" | "yoy_amt_pct" | "yoy_cnt_pct" | "atv" | "yoy_atv_pct";

const PREV_BAR = "#c5ced8";

const INDUSTRY_COLUMNS: { key: IndustrySortKey; label: string }[] = [
  { key: "ry_nm", label: "업종" },
  { key: "est_amt", label: "당월(억원)" },
  { key: "est_amt_bf", label: "전년(억원)" },
  { key: "yoy_amt_pct", label: "금액 전년비" },
  { key: "yoy_cnt_pct", label: "건수 전년비" },
  { key: "atv", label: "건당금액(원)" },
  { key: "yoy_atv_pct", label: "단가 전년비" },
];

function readCross(value: unknown): Series | null {
  if (!isRecord(value)) return null;
  const labels = labelsOf(value.labels);
  if (labels.length === 0) return null;
  return { labels, current: numbers(value.current), prev: numbers(value.prev), yoy: numbers(value.yoy) };
}

function AmountLegend() {
  return (
    <Legend
      items={[
        { label: "당월", swatch: "bg-[#0046ff]" },
        { label: "전년", swatch: "bg-[#c5ced8]" },
        { label: "전년비", swatch: "bg-amber-500", line: true },
      ]}
    />
  );
}

const NO_REGION_INDUSTRIES = new Set(["IT/디지털", "음원/콘텐츠", "상품권/쿠폰"]);

function ChartBlock({ title, series, fit, note }: { title: string; series: Series; fit?: boolean; note?: string }) {
  return (
    <div className="mt-6">
      <Section title={title} caption="세로 막대는 당월·전년 취급액(억원)이고, 선은 전년비입니다.">
        <AmountLegend />
        <ColumnChart labels={series.labels} current={series.current} prev={series.prev} line={series.yoy} fit={fit} />
        {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
      </Section>
    </div>
  );
}

function AgeSexChart({ value }: { value: unknown }) {
  const record = isRecord(value) ? value : null;
  const labels = labelsOf(record?.labels);
  const male = readCross(record?.male);
  const female = readCross(record?.female);
  if (!labels.length || !male || !female) return null;
  const max = Math.max(1, ...male.current, ...male.prev, ...female.current, ...female.prev);
  const [hover, setHover] = useState<number | null>(null);
  function bars(side: "male" | "female", index: number) {
    const series = side === "male" ? male! : female!;
    const align = side === "male" ? "justify-end" : "justify-start";
    return (
      <div className={`flex flex-1 flex-col gap-1 ${align}`}>
        {[series.current[index] ?? 0, series.prev[index] ?? 0].map((amount, barIndex) => (
          <div key={barIndex} className={`flex h-2.5 w-full ${align}`}>
            <div className="h-full rounded-sm" style={{ width: `${(amount / max) * 100}%`, background: barIndex === 0 ? "#0046ff" : PREV_BAR }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-6">
      <Section title="성연령대별 취급액" caption="왼쪽은 남성, 오른쪽은 여성이고, 가로 막대는 당월·전년 취급액(억원)입니다.">
        <Legend items={[{ label: "당월", swatch: "bg-[#0046ff]" }, { label: "전년", swatch: "bg-[#c5ced8]" }]} />
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex-1 text-right">남</span>
          <span className="w-14 shrink-0" />
          <span className="flex-1">여</span>
        </div>
        <div className="relative">
          {labels.map((label, index) => (
            <div
              key={label}
              className="flex items-center gap-2 py-1"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            >
              {bars("male", index)}
              <span className="w-14 shrink-0 text-center text-[11px] text-muted-foreground">{label}</span>
              {bars("female", index)}
            </div>
          ))}
          {hover !== null ? (
            <div className="pointer-events-none absolute top-1 left-1/2 z-10 -translate-x-1/2 rounded-md bg-[#0b2e6f] px-2.5 py-1.5 text-[11px] leading-relaxed text-white shadow-sm">
              <p>{labels[hover]}</p>
              <p>남 당월 {formatNum(male.current[hover])} / 전년 {formatNum(male.prev[hover])}</p>
              <p>여 당월 {formatNum(female.current[hover])} / 전년 {formatNum(female.prev[hover])}</p>
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
}

function IndustryCharts({ name, item }: { name: string; item: Record<string, unknown> }) {
  const weekly = readCross(item.wdn);
  const age = readCross(item.age);
  const region = readCross(item.cty);
  const time = readCross(item.tm);
  const showRegion = !NO_REGION_INDUSTRIES.has(name);
  return (
    <>
      {weekly ? <ChartBlock title="주차별 취급액" series={weekly} fit /> : null}
      {age ? <ChartBlock title="연령대별 취급액" series={age} fit /> : null}
      <AgeSexChart value={item.age_sex} />
      {showRegion && region ? <ChartBlock title="지역별 취급액" series={region} fit={region.labels.length <= 8} note="가맹점 소재지 기준 취급액임" /> : null}
      {time ? <ChartBlock title="시간대별 취급액" series={time} fit /> : null}
    </>
  );
}

function IndustryMenu({
  openPanel,
  names,
  value,
  onOpen,
  onPick,
}: {
  openPanel: boolean;
  names: string[];
  value: string;
  onOpen: () => void;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const keyword = query.trim().toLowerCase();
  const filtered = keyword ? names.filter((name) => name.toLowerCase().includes(keyword)) : names;
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          onOpen();
          setOpen((current) => !current);
        }}
        className={`inline-flex items-center gap-1 border-b-2 pb-2 text-sm font-semibold ${openPanel ? "border-[#0046ff] text-[#0046ff]" : "border-transparent text-muted-foreground"}`}
      >
        <span>{value ? `업종별 > ${value}` : "업종별"}</span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-30 min-w-44 bg-background">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="검색"
            className="w-full bg-transparent px-0 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <ul className="max-h-72 overflow-y-auto">
            {filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(name);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-1.5 py-1 text-left text-sm hover:text-[#0046ff] ${name === value ? "font-semibold text-[#0046ff]" : "text-foreground"}`}
                >
                  <Check className={`size-3.5 shrink-0 ${name === value ? "opacity-100" : "opacity-0"}`} />
                  <span>{name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="py-1 text-xs text-muted-foreground">해당하는 업종이 없습니다.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">{caption}</p>
      {children}
    </section>
  );
}

export default function MonthlyDashboardPage() {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<IndustrySortKey>("est_amt");
  const [sortAsc, setSortAsc] = useState(false);
  const [panel, setPanel] = useState<"overview" | "industry">("overview");
  const [industryName, setIndustryName] = useState("");

  useEffect(() => {
    const storageKey = "monthly-dashboard-v1";
    let stored: { etag?: string; body?: { metrics?: MetricRow[]; uploads?: UploadRow[] } } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    } catch {
      stored = null;
    }
    const headers = new Headers();
    if (stored?.etag) headers.set("If-None-Match", stored.etag);
    fetch("/api/dashboard", { headers, cache: "no-store" })
      .then(async (res) => {
        if (res.status === 304 && stored?.body) {
          const nextMetrics = stored.body.metrics ?? [];
          setMetrics(nextMetrics);
          setUploads(stored.body.uploads ?? []);
          setMonth(nextMetrics[0]?.year_month ?? stored.body.uploads?.[0]?.year_month ?? "");
          return;
        }
        const body = await res.json();
        if (res.status === 401 || res.status === 403) {
          setBlocked(true);
          return;
        }
        if (!res.ok) throw new Error(body.error ?? "불러오기 실패");
        const etag = res.headers.get("etag");
        if (etag) {
          try {
            localStorage.setItem(storageKey, JSON.stringify({ etag, body }));
          } catch {
            // 브라우저 저장 한도를 넘으면 이번 조회만 사용한다.
          }
        }
        const nextMetrics = (body.metrics ?? []) as MetricRow[];
        setMetrics(nextMetrics);
        setUploads(body.uploads ?? []);
        setMonth(nextMetrics[0]?.year_month ?? body.uploads?.[0]?.year_month ?? "");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => metrics.find((row) => row.year_month === month) ?? null, [metrics, month]);
  const months = Array.from(new Set([...metrics.map((row) => row.year_month), ...uploads.map((row) => row.year_month)]));
  const payload = selected?.payload ?? null;
  const dash = isRecord(payload?._dashboard) ? payload._dashboard : null;
  const basis = isRecord(payload?.["기준"]) ? payload["기준"] : null;
  const summary = isRecord(payload?.["요약"]) ? payload["요약"] : null;
  const kpi = isRecord(dash?.kpi) ? dash.kpi : null;
  const weekly = seriesFrom(isRecord(dash?.wdn) ? dash.wdn : null, { labels: "cur_labels", current: "current", prev: "prev", yoy: "yoy" }) ?? seriesFromRows(payload?.["주차별"]);
  const industryAmt = seriesFrom(isRecord(dash?.ry) ? dash.ry : null, { labels: "amt_labels", current: "amt_current", prev: "amt_prev" }) ?? seriesFromRows(payload?.["업종 상위"]);
  const industryYoy = seriesFrom(isRecord(dash?.ry) ? dash.ry : null, { labels: "yoy_labels", current: "yoy_vals" });
  const age = seriesFrom(isRecord(dash?.age) ? dash.age : null, { labels: "labels10", current: "current10", prev: "prev10", yoy: "yoy10" }) ?? seriesFromRows(payload?.["연령"]);
  const regionAmt = seriesFrom(isRecord(dash?.cty) ? dash.cty : null, { labels: "amt_labels", current: "amt_current", prev: "amt_prev" }) ?? seriesFromRows(payload?.["지역"]);
  const regionYoy = seriesFrom(isRecord(dash?.cty) ? dash.cty : null, { labels: "yoy_labels", current: "yoy_vals" });
  const time = seriesFrom(isRecord(dash?.tm) ? dash.tm : null, { labels: "labels", current: "current", prev: "prev" }) ?? seriesFromRows(payload?.["시간대"]);
  const industries = Array.isArray(dash?.tbl) ? dash.tbl.filter(isRecord) : [];
  const industryCross = isRecord(dash?.industry_cross) ? dash.industry_cross : null;
  const industryNames = (industryCross
    ? Object.keys(industryCross)
    : industries.map((row) => String(row.ry_nm ?? "")).filter(Boolean)
  ).sort((a, b) => a.localeCompare(b, "ko"));
  const activeIndustry = industryNames.includes(industryName) ? industryName : "";
  const picked = activeIndustry && industryCross && isRecord(industryCross[activeIndustry]) ? industryCross[activeIndustry] : null;
  const pickedKpi = isRecord(picked?.kpi) ? picked.kpi : null;
  const pickedAmt = typeof pickedKpi?.total_amt === "number" ? pickedKpi.total_amt : null;
  const pickedAmtBf = typeof pickedKpi?.total_amt_bf === "number" ? pickedKpi.total_amt_bf : null;
  const pickedCnt = typeof pickedKpi?.total_cnt === "number" ? pickedKpi.total_cnt : null;
  const pickedCntBf = typeof pickedKpi?.total_cnt_bf === "number" ? pickedKpi.total_cnt_bf : null;
  const pickedAtv = typeof pickedKpi?.atv === "number" ? pickedKpi.atv : null;
  const pickedAtvBf = typeof pickedKpi?.atv_bf === "number" ? pickedKpi.atv_bf : null;
  const sortedIndustries = useMemo(() => {
    const copy = [...industries];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const leftMissing = left === null || left === undefined || left === "";
      const rightMissing = right === null || right === undefined || right === "";
      if (leftMissing && rightMissing) return 0;
      if (leftMissing) return 1;
      if (rightMissing) return -1;
      if (typeof left === "number" && typeof right === "number") return sortAsc ? left - right : right - left;
      return sortAsc ? String(left).localeCompare(String(right), "ko") : String(right).localeCompare(String(left), "ko");
    });
    return copy;
  }, [industries, sortKey, sortAsc]);
  const totalAmt = typeof kpi?.total_amt === "number" ? kpi.total_amt : null;
  const totalAmtBf = typeof kpi?.total_amt_bf === "number" ? kpi.total_amt_bf : null;
  const totalCnt = typeof kpi?.total_cnt === "number" ? kpi.total_cnt : null;
  const totalCntBf = typeof kpi?.total_cnt_bf === "number" ? kpi.total_cnt_bf : null;
  const yoyAmt = typeof kpi?.yoy_amt === "number" ? kpi.yoy_amt : typeof summary?.["거래금액 전년비(%)"] === "number" ? summary["거래금액 전년비(%)"] : null;
  const yoyCnt = typeof kpi?.yoy_cnt === "number" ? kpi.yoy_cnt : typeof summary?.["거래건수 전년비(%)"] === "number" ? summary["거래건수 전년비(%)"] : null;
  const unit = totalAmt !== null && totalCnt ? Math.round((totalAmt / totalCnt) * 10000) : null;
  const unitBf = totalAmtBf !== null && totalCntBf ? Math.round((totalAmtBf / totalCntBf) * 10000) : null;
  const unitYoy = unit !== null && unitBf ? ((unit - unitBf) / unitBf) * 100 : null;

  if (blocked) {
    return <ComingSoon title="월별 소비데이터 현황" description="관리자 계정에서 베타로 제공 중입니다." />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 py-8 sm:py-12">
      <h1 className="text-xl font-bold sm:text-2xl">월별 소비데이터 현황</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        원본을 올릴 때 한 번 집계한 숫자를 보여 줍니다. 기준월을 고르면 그 달의 요약부터 봅니다.
      </p>

      {loading ? <p className="mt-8 text-sm text-muted-foreground">불러오는 중...</p> : null}
      {error ? <p className="mt-8 text-sm text-red-500">{error}</p> : null}

      {!loading && !error && months.length === 0 ? (
        <p className="mt-8 rounded-xl bg-muted px-4 py-6 text-sm text-muted-foreground">
          등록된 월별 데이터가 없습니다. 관리자 화면의 데이터 업로드에서 원본을 등록하면 여기에 표시됩니다.
        </p>
      ) : null}

      {months.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-semibold text-muted-foreground">기준월</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {months.map((item) => (
                <option key={item} value={item}>{formatMonth(item)}</option>
              ))}
            </select>
          </label>
          {typeof basis?.["비교월"] === "string" ? (
            <p className="pb-2 text-sm text-muted-foreground">비교월 {basis["비교월"]}</p>
          ) : null}
        </div>
      ) : null}

      {months.length > 0 ? (
        <div className="mt-4 flex gap-4 overflow-visible border-b border-border">
          <button
            type="button"
            onClick={() => setPanel("overview")}
            className={`shrink-0 border-b-2 pb-2 text-sm font-semibold ${panel === "overview" ? "border-[#0046ff] text-[#0046ff]" : "border-transparent text-muted-foreground"}`}
          >
            개요
          </button>
          <IndustryMenu
            openPanel={panel === "industry"}
            names={industryNames}
            value={activeIndustry}
            onOpen={() => setPanel("industry")}
            onPick={(name) => {
              setIndustryName(name);
              setPanel("industry");
            }}
          />
        </div>
      ) : null}

      {panel === "overview" && (kpi || summary) ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <KpiCard label="추정 총 거래금액" yoy={yoyAmt} current={`${formatNum(totalAmt ?? (typeof summary?.["추정 총 거래금액(억원)"] === "number" ? summary["추정 총 거래금액(억원)"] : null))}억원`} previous={`${formatNum(totalAmtBf)}억원`} />
          <KpiCard label="추정 총 거래건수" yoy={yoyCnt} current={`${formatNum(totalCnt ?? (typeof summary?.["추정 총 거래건수(만건)"] === "number" ? summary["추정 총 거래건수(만건)"] : null))}만건`} previous={`${formatNum(totalCntBf)}만건`} />
          <KpiCard label="건당 거래금액" yoy={unitYoy} current={`${formatNum(unit)}원`} previous={`${formatNum(unitBf)}원`} />
        </div>
      ) : null}

      {panel === "overview" && weekly ? (
        <div className="mt-6">
          <Section title="주차별 취급액" caption="세로 막대는 당월·전년 취급액(억원)이고, 선은 전년비입니다.">
            <Legend
              items={[
                { label: "당월", swatch: "bg-[#0046ff]" },
                { label: "전년", swatch: "bg-[#c5ced8]" },
                { label: "전년비", swatch: "bg-amber-500", line: true },
              ]}
            />
            <ColumnChart labels={weekly.labels} current={weekly.current} prev={weekly.prev} line={weekly.yoy} fit />
            <p className="mt-2 text-xs text-muted-foreground">월별로 주차에 포함된 일수가 다를 수 있습니다.</p>
          </Section>
        </div>
      ) : null}

      {panel === "overview" && (industryAmt || industryYoy) ? (
        <div className="mt-6">
          <Section title="업종별 취급액" caption="금액이 큰 업종 순입니다. 전년비는 같은 업종을 증감 순으로 다시 세운 세로 막대입니다.">
            <Tabs defaultValue="amt">
              <TabsList>
                <TabsTrigger value="amt">거래금액</TabsTrigger>
                <TabsTrigger value="yoy">전년비</TabsTrigger>
              </TabsList>
              <TabsContent value="amt" className="pt-4">
                {industryAmt ? (
                  <>
                    <Legend items={[{ label: "당월", swatch: "bg-[#0046ff]" }, { label: "전년", swatch: "bg-[#c5ced8]" }]} />
                    <ColumnChart labels={industryAmt.labels} current={industryAmt.current} prev={industryAmt.prev} />
                  </>
                ) : null}
              </TabsContent>
              <TabsContent value="yoy" className="pt-4">
                {industryYoy ? (
                  <>
                    <Legend items={[{ label: "전년비", swatch: "bg-[#0046ff]" }]} />
                    <ColumnChart labels={industryYoy.labels} current={industryYoy.current} amountAxis={false} />
                  </>
                ) : null}
              </TabsContent>
            </Tabs>
          </Section>
        </div>
      ) : null}

      {panel === "overview" && age ? (
        <div className="mt-6">
          <Section title="연령대별 취급액" caption="10세 단위입니다. 막대는 당월·전년(억원), 선은 전년비입니다.">
            <Legend
              items={[
                { label: "당월", swatch: "bg-[#0046ff]" },
                { label: "전년", swatch: "bg-[#c5ced8]" },
                { label: "전년비", swatch: "bg-amber-500", line: true },
              ]}
            />
            <ColumnChart labels={age.labels} current={age.current} prev={age.prev} line={age.yoy} fit />
          </Section>
        </div>
      ) : null}

      {panel === "overview" && (regionAmt || regionYoy) ? (
        <div className="mt-6">
          <Section title="지역별 취급액" caption="막대는 세로입니다. 전년 비교색은 다크 모드에서도 구분됩니다.">
            <Tabs defaultValue="amt">
              <TabsList>
                <TabsTrigger value="amt">거래금액</TabsTrigger>
                <TabsTrigger value="yoy">전년비</TabsTrigger>
              </TabsList>
              <TabsContent value="amt" className="pt-4">
                {regionAmt ? (
                  <>
                    <Legend items={[{ label: "당월", swatch: "bg-[#0046ff]" }, { label: "전년", swatch: "bg-[#c5ced8]" }]} />
                    <ColumnChart labels={regionAmt.labels} current={regionAmt.current} prev={regionAmt.prev} />
                  </>
                ) : null}
              </TabsContent>
              <TabsContent value="yoy" className="pt-4">
                {regionYoy ? <ColumnChart labels={regionYoy.labels} current={regionYoy.current} amountAxis={false} /> : null}
              </TabsContent>
            </Tabs>
          </Section>
        </div>
      ) : null}

      {panel === "overview" && time ? (
        <div className="mt-6">
          <Section title="시간대별 취급액" caption="세로 막대는 당월·전년 취급액(억원)이고, 선은 전년비입니다.">
            <Legend
              items={[
                { label: "당월", swatch: "bg-[#0046ff]" },
                { label: "전년", swatch: "bg-[#c5ced8]" },
                { label: "전년비", swatch: "bg-amber-500", line: true },
              ]}
            />
            <ColumnChart
              labels={time.labels}
              current={time.current}
              prev={time.prev}
              line={time.current.map((value, index) => {
                const before = time.prev[index];
                return before ? ((value - before) / before) * 100 : 0;
              })}
              fit
            />
          </Section>
        </div>
      ) : null}

      {panel === "overview" && industries.length > 0 ? (
        <div className="mt-6">
          <Section title="업종별 상세" caption="금액, 건수, 건당금액의 전년비입니다.">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr>
                    {INDUSTRY_COLUMNS.map((column) => (
                      <th key={column.key} className="whitespace-nowrap px-3 py-2 font-semibold">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1"
                          onClick={() => {
                            if (sortKey === column.key) setSortAsc((value) => !value);
                            else {
                              setSortKey(column.key);
                              setSortAsc(column.key === "ry_nm");
                            }
                          }}
                        >
                          {column.label}
                          {sortKey === column.key ? (sortAsc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedIndustries.map((row, index) => {
                    const yoyAmtCell = typeof row.yoy_amt_pct === "number" ? row.yoy_amt_pct : null;
                    const yoyCntCell = typeof row.yoy_cnt_pct === "number" ? row.yoy_cnt_pct : null;
                    const yoyAtv = typeof row.yoy_atv_pct === "number" ? row.yoy_atv_pct : null;
                    return (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-2">{String(row.ry_nm ?? "-")}</td>
                        <td className="px-3 py-2">{formatNum(typeof row.est_amt === "number" ? row.est_amt : null)}</td>
                        <td className="px-3 py-2">{formatNum(typeof row.est_amt_bf === "number" ? row.est_amt_bf : null)}</td>
                        <td className={`px-3 py-2 ${yoyClass(yoyAmtCell)}`}>{formatYoy(yoyAmtCell)}</td>
                        <td className={`px-3 py-2 ${yoyClass(yoyCntCell)}`}>{formatYoy(yoyCntCell)}</td>
                        <td className="px-3 py-2">{formatNum(typeof row.atv === "number" ? row.atv : null)}</td>
                        <td className={`px-3 py-2 ${yoyClass(yoyAtv)}`}>{formatYoy(yoyAtv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      ) : null}

      {panel === "industry" ? (
        <div className="mt-4">
          {!industryCross ? (
            <p className="mt-4 text-sm text-muted-foreground">
              이 달은 업종별 집계가 아직 없습니다. 관리자 화면에서 해당 월 대시보드를 다시 만들면 주차·연령·지역·시간대가 표시됩니다.
            </p>
          ) : picked && pickedKpi ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <KpiCard label="거래금액" yoy={typeof pickedKpi.yoy_amt === "number" ? pickedKpi.yoy_amt : null} current={`${formatNum(pickedAmt)}억원`} previous={`${formatNum(pickedAmtBf)}억원`} />
                <KpiCard label="거래건수" yoy={typeof pickedKpi.yoy_cnt === "number" ? pickedKpi.yoy_cnt : null} current={`${formatNum(pickedCnt, 2)}만건`} previous={`${formatNum(pickedCntBf, 2)}만건`} />
                <KpiCard label="단가" yoy={typeof pickedKpi.yoy_atv === "number" ? pickedKpi.yoy_atv : null} current={`${formatNum(pickedAtv)}원`} previous={`${formatNum(pickedAtvBf)}원`} />
              </div>
              <IndustryCharts name={activeIndustry} item={picked} />
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">업종을 고르면 그 업종의 주차별, 연령대별, 지역별, 시간대별 취급액이 나옵니다.</p>
          )}
        </div>
      ) : null}

      {!loading && month && !selected?.payload ? (
        <p className="mt-6 rounded-xl bg-muted px-4 py-6 text-sm text-muted-foreground">
          {formatMonth(month)} 원본은 등록되어 있지만, 집계 결과는 아직 없습니다.
          {uploads.find((row) => row.year_month === month)?.error_message
            ? ` (${uploads.find((row) => row.year_month === month)?.error_message})`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
