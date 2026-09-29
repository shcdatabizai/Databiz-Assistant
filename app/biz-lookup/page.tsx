"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MiniPopover } from "@/components/biz/MiniPopover";
import type { InquiryResult, Categories } from "@/lib/biz/types";

const ACCENT = "#0046ff";

const TELECOM_FIELD_MAPPING: Record<string, string> = {
  bzmnNm: "사업자명", bzmnRgsSttusSeNm: "등록상태", lctnAddr: "지번주소",
  lctnRnAddr: "도로명주소", dclrDate: "신고일자", telno: "전화번호",
  domncn: "도메인", ntslMthdCn: "판매방식", ntslPrdlstCn: "판매물품",
  operSttusCdNm: "운영상태", corpYnNm: "법인여부", crno: "법인등록번호",
  ctpvNm: "시도명", rprsvEmladr: "대표이메일", prcsDeptNm: "처리부서명",
  prmmiYr: "허가개시년도", lctnRnOzip: "우편번호",
};

interface SortConfig {
  column: string | null;
  ascending: boolean;
}

interface MappingModalState {
  isOpen: boolean;
  resultIndex: number | null;
  mappingType: "mct_ry_cd" | "hpsn_mct_zcd" | null;
}

const IQ_BIZNO_FIELDS = [
  { value: "상호명", label: "상호명" }, { value: "사업자등록번호", label: "사업자등록번호" },
  { value: "사업자상태", label: "사업자상태" }, { value: "사업장명", label: "사업장명" },
  { value: "대표자명", label: "대표자명" }, { value: "사업장주소", label: "사업장주소" },
];
const IQ_CRAWL_FIELDS = [
  { value: "상호명", label: "상호명" }, { value: "주소", label: "주소" },
  { value: "사업자상태", label: "사업자상태" }, { value: "업태", label: "업태" },
  { value: "종목", label: "종목" }, { value: "국세청산업분류_대분류", label: "산업분류(대)" },
  { value: "국세청산업분류_중분류", label: "산업분류(중)" }, { value: "국세청산업분류_소분류", label: "산업분류(소)" },
  { value: "국세청산업분류_세분류", label: "산업분류(세)" }, { value: "국세청산업분류_세세분류", label: "산업분류(세세)" },
];
const IQ_TELE_FIELDS = [
  { value: "bzmnNm", label: "사업자명" }, { value: "bzmnRgsSttusSeNm", label: "등록상태" },
  { value: "lctnAddr", label: "지번주소" }, { value: "lctnRnAddr", label: "도로명주소" },
  { value: "dclrDate", label: "신고일자" }, { value: "telno", label: "전화번호" },
  { value: "domncn", label: "도메인" }, { value: "ntslMthdCn", label: "판매방식" },
  { value: "ntslPrdlstCn", label: "판매물품" }, { value: "operSttusCdNm", label: "운영상태" },
  { value: "corpYnNm", label: "법인여부" }, { value: "crno", label: "법인등록번호" },
  { value: "ctpvNm", label: "시도명" }, { value: "rprsvEmladr", label: "대표이메일" },
  { value: "prcsDeptNm", label: "처리부서명" }, { value: "prmmiYr", label: "허가개시년도" },
  { value: "lctnRnOzip", label: "우편번호" },
];
const IQ_MAPPING_FIELDS = [
  { value: "mct_ry_cd", label: "가맹점업종코드" }, { value: "mct_ry_nm", label: "가맹점업종명" },
  { value: "hpsn_mct_zcd", label: "초개인화업종코드" }, { value: "hpsn_mct_nm", label: "초개인화업종명" },
];

const iqToggle = (val: string, arr: string[], set: (a: string[]) => void) =>
  set(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);

function IqFieldGroup({ title, fields, sel, setSel }: {
  title: string; fields: { value: string; label: string }[]; sel: string[]; setSel: (a: string[]) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 500, fontSize: "0.8rem" }}>{title}</span>
        <label style={{ fontSize: "0.75rem", cursor: "pointer" }}>
          <input type="checkbox" checked={sel.length === fields.length}
            onChange={(e) => setSel(e.target.checked ? fields.map((f) => f.value) : [])} style={{ marginRight: 4 }} />
          전체 선택
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {fields.map((f) => (
          <label key={f.value} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.8rem" }}>
            <input type="checkbox" checked={sel.includes(f.value)} onChange={() => iqToggle(f.value, sel, setSel)} />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function KVTable({ data }: { data: Record<string, unknown> }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k}>
            <th style={{ width: "35%", color: "#8b8b94", fontWeight: 500, background: "#f5f5f4", padding: "3px 6px", borderBottom: "1px solid #ebe9f1", textAlign: "left", fontSize: "0.75rem" }}>{k}</th>
            <td style={{ padding: "3px 6px", borderBottom: "1px solid #ebe9f1", wordBreak: "break-word" }}>
              {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourceBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ebe9f1", borderRadius: 8, padding: 10, height: "100%" }}>
      <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginBottom: 6, color: ACCENT }}>{title}</div>
      {children}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultDetailContent({ result }: { result: any }) {
  const brno = result.brno || "";
  const api = result.api || {};
  const crawl = result.crawl;

  const biznoBlock = () => {
    const src = api.bizno;
    if (!src) return <p style={{ color: "#8b8b94", textAlign: "center" }}>조회 안 됨</p>;
    if (!src.success) return <p style={{ color: "#dc2626" }}>{src.error || "조회 실패"}</p>;
    if (!src.found) return <p style={{ color: "#8b8b94", textAlign: "center" }}>검색 결과 없음</p>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matched = (src.items || []).filter((item: any) =>
      (item["사업자등록번호"] || item.bizno || "").replace(/\D/g, "") === brno
    );
    if (matched.length === 0) return <p style={{ color: "#8b8b94", textAlign: "center" }}>조회값 없음</p>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <>{matched.map((item: any, i: number) => <KVTable key={i} data={item} />)}</>;
  };

  const govBlock = () => {
    const src = api.gov;
    if (!src) return <p style={{ color: "#8b8b94", textAlign: "center" }}>조회 안 됨</p>;
    if (!src.success) return <p style={{ color: "#dc2626" }}>{src.error || "조회 실패"}</p>;
    if (!src.found) return <p style={{ color: "#8b8b94", textAlign: "center" }}>검색 결과 없음</p>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (src.items || []).map((item: any) => {
      const m: Record<string, unknown> = {};
      Object.entries(item).forEach(([k, v]) => { m[TELECOM_FIELD_MAPPING[k] || k] = v; });
      return m;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <>{items.map((item: any, i: number) => <KVTable key={i} data={item} />)}</>;
  };

  const crawlBlock = () => {
    if (!crawl) return <p style={{ color: "#8b8b94", textAlign: "center" }}>조회 안 됨</p>;
    if (!crawl.success) return <p style={{ color: "#dc2626" }}>{crawl.error || "조회 실패"}</p>;
    if (!crawl.found) return <p style={{ color: "#8b8b94", textAlign: "center" }}>검색 결과 없음</p>;
    if (crawl.search) {
      const cb = (crawl.search["사업자번호"] || crawl.search.bizno || "").replace(/\D/g, "");
      if (cb && cb !== brno) return <p style={{ color: "#8b8b94", textAlign: "center" }}>조회값 없음</p>;
    }
    const search = crawl.search || {};
    const detail = crawl.detail || {};
    const detailRows: Record<string, unknown> = {};
    const catOrder = ["대분류", "중분류", "소분류", "세분류", "세세분류"];
    const cat = detail["국세청산업분류"];
    if (cat && typeof cat === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      catOrder.forEach((c) => { if ((cat as any)[c]) detailRows[`국세청산업분류 - ${c}`] = (cat as any)[c]; });
    }
    Object.entries(detail).forEach(([k, v]) => { if (k !== "국세청산업분류") detailRows[k] = v; });
    return (
      <>
        {Object.keys(search).length > 0 && <><div style={{ fontSize: "0.75rem", color: "#8b8b94", fontWeight: 600, marginBottom: 4 }}>검색 결과</div><KVTable data={search} /></>}
        {Object.keys(detailRows).length > 0 && <><div style={{ fontSize: "0.75rem", color: "#8b8b94", fontWeight: 600, margin: "8px 0 4px" }}>상세 정보</div><KVTable data={detailRows} /></>}
      </>
    );
  };

  const mappingBlock = () => {
    const m = result.mapping;
    if (!m || (!m.mct_ry_cd?.code && !m.hpsn_mct_zcd?.code)) {
      return <p style={{ color: "#8b8b94", textAlign: "center" }}>없음</p>;
    }
    return (
      <>
        {m.mct_ry_cd?.code && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8b94", fontWeight: 600, marginBottom: 2 }}>가맹점원장업종</div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{m.mct_ry_cd.code}</div>
            <div style={{ fontSize: "0.8rem", color: "#555" }}>{m.mct_ry_cd.name}</div>
          </div>
        )}
        {m.hpsn_mct_zcd?.code && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: "0.75rem", color: "#8b8b94", fontWeight: 600, marginBottom: 2 }}>초개인화업종</div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{m.hpsn_mct_zcd.code}</div>
            <div style={{ fontSize: "0.8rem", color: "#555" }}>{m.hpsn_mct_zcd.name}</div>
          </div>
        )}
        {m.reasoning && (
          <div style={{ marginTop: 8, padding: 8, background: "#f5f5f4", borderRadius: 6, fontSize: "0.75rem", color: "#555", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "#8b8b94", marginBottom: 4 }}>매핑사유</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.reasoning}</div>
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ padding: 12, background: "#f5f5f4", borderTop: "1px solid #ebe9f1" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "auto 1fr", gap: 8, minHeight: 180 }}>
        <div style={{ gridColumn: 1, gridRow: 1 }}><SourceBlock title="Bizno API">{biznoBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 2, gridRow: "1 / 3" }}><SourceBlock title="통신판매업">{govBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 1, gridRow: 2 }}><SourceBlock title="Bizno 크롤링">{crawlBlock()}</SourceBlock></div>
        <div style={{ gridColumn: 3, gridRow: "1 / 3" }}><SourceBlock title="업종매핑">{mappingBlock()}</SourceBlock></div>
      </div>
    </div>
  );
}

export default function BizLookupPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [bizNumbersInput, setBizNumbersInput] = useState("");
  const [performCategoryMapping, setPerformCategoryMapping] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<{ total: number; completed: number; current: string } | null>(null);

  const [allResults, setAllResults] = useState<InquiryResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, ascending: true });

  const [emailAddress, setEmailAddress] = useState("");

  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [mappingModalState, setMappingModalState] = useState<MappingModalState>({ isOpen: false, resultIndex: null, mappingType: null });
  const [categories, setCategories] = useState<Categories | null>(null);
  const [mappingSearchInput, setMappingSearchInput] = useState("");

  const [selectedBiznoFields, setSelectedBiznoFields] = useState<string[]>(IQ_BIZNO_FIELDS.map((f) => f.value));
  const [selectedCrawlFields, setSelectedCrawlFields] = useState<string[]>(IQ_CRAWL_FIELDS.map((f) => f.value));
  const [selectedTeleFields, setSelectedTeleFields] = useState<string[]>(IQ_TELE_FIELDS.map((f) => f.value));
  const [selectedMappingFields, setSelectedMappingFields] = useState<string[]>(IQ_MAPPING_FIELDS.map((f) => f.value));
  const [excludeErrors, setExcludeErrors] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  useEffect(() => {
    if (!isLoading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLoading]);

  const parseBusinessNumbers = (input: string): string[] => {
    return input
      .split(/[\n,;]+/)
      .map((num) => num.replace(/[^\d-]/g, "").trim())
      .filter((num) => num.replace(/\D/g, "").length === 10)
      .map((num) => num.replace(/\D/g, ""));
  };

  const validateInput = (): boolean => {
    if (!bizNumbersInput.trim()) {
      setError("사업자번호를 입력해주세요.");
      return false;
    }
    const numbers = parseBusinessNumbers(bizNumbersInput);
    if (numbers.length === 0) {
      setError("유효한 사업자번호가 없습니다.");
      return false;
    }
    if (numbers.length > 100) {
      setError("최대 100개까지 조회할 수 있습니다.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleLookup = async () => {
    if (!validateInput()) return;

    setIsLoading(true);
    setStatusMessage(null);
    setError(null);
    setAllResults([]);
    setExpandedResults(new Set());
    setSortConfig({ column: null, ascending: true });

    const numbers = parseBusinessNumbers(bizNumbersInput);
    setStreamProgress({ total: numbers.length, completed: 0, current: "" });

    const collected: InquiryResult[] = [];

    for (const brno of numbers) {
      setStreamProgress((prev) => (prev ? { ...prev, current: brno } : null));
      try {
        const res = await fetch("/api/biz/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brno, perform_category_mapping: performCategoryMapping, user_id: userId }),
        });
        if (res.ok) {
          const result = await res.json();
          collected.push(result);
          setAllResults([...collected]);
        }
      } catch {
        /* skip individual failures */
      }
      setStreamProgress((prev) => (prev ? { ...prev, completed: prev.completed + 1 } : null));
    }

    setStreamProgress(null);
    setIsLoading(false);
    setStatusMessage(`${collected.length}건 조회 완료`);
    setToastMsg(`${collected.length}개 사업자 정보를 조회했습니다.`);
  };

  const toggleExpand = (brno: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(brno)) newExpanded.delete(brno);
    else newExpanded.add(brno);
    setExpandedResults(newExpanded);
  };

  const handleSort = (column: string) => {
    setSortConfig((prev) => ({ column, ascending: prev.column === column ? !prev.ascending : true }));
  };

  const getStatusValue = (success?: boolean, found?: boolean): number => {
    if (success === false) return 0;
    if (success && found) return 2;
    if (success && !found) return 1;
    return -1;
  };

  const sortedResults = useMemo(() => {
    if (!sortConfig.column) return allResults;

    const sorted = [...allResults].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortConfig.column) {
        case "brno":
          aVal = a.brno_formatted; bVal = b.brno_formatted; break;
        case "company_name":
          aVal = a.company_name || ""; bVal = b.company_name || ""; break;
        case "query_date":
          aVal = new Date(a.query_date || 0).getTime(); bVal = new Date(b.query_date || 0).getTime(); break;
        case "bizno_status":
          aVal = getStatusValue(a.api?.bizno?.success, a.api?.bizno?.found); bVal = getStatusValue(b.api?.bizno?.success, b.api?.bizno?.found); break;
        case "crawl_status":
          aVal = getStatusValue(a.crawl?.success, a.crawl?.found); bVal = getStatusValue(b.crawl?.success, b.crawl?.found); break;
        case "gov_status":
          aVal = getStatusValue(a.api?.gov?.success, a.api?.gov?.found); bVal = getStatusValue(b.api?.gov?.success, b.api?.gov?.found); break;
        default:
          return 0;
      }

      if (typeof aVal === "string") {
        return sortConfig.ascending ? aVal.localeCompare(bVal as string, "ko") : (bVal as string).localeCompare(aVal, "ko");
      }
      return sortConfig.ascending ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return sorted;
  }, [allResults, sortConfig]);

  const sortIcon = (col: string) =>
    sortConfig.column !== col
      ? <span style={{ opacity: 0.4, fontSize: "0.7rem" }}>↕</span>
      : <span style={{ color: ACCENT, fontSize: "0.7rem" }}>{sortConfig.ascending ? "▲" : "▼"}</span>;

  const statusDot = (success?: boolean, found?: boolean) => {
    if (success === false) return <span style={{ color: "#dc2626", fontSize: "0.8125rem" }}>● 오류</span>;
    if (success && found) return <span style={{ color: "#10b981", fontSize: "0.8125rem" }}>● 조회됨</span>;
    if (success && !found) return <span style={{ color: "#999", fontSize: "0.8125rem" }}>○ 없음</span>;
    return <span style={{ color: "#ccc", fontSize: "0.8125rem" }}>-</span>;
  };

  const iqThStyle: React.CSSProperties = { padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#8b8b94", fontSize: "0.8125rem", whiteSpace: "nowrap" };
  const iqTdStyle: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #ebe9f1", fontSize: "0.8125rem", height: 38 };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return dateString || "-";
    }
  };

  const openMappingModal = async (resultIndex: number, type: "mct_ry_cd" | "hpsn_mct_zcd") => {
    if (!categories) {
      try {
        const res = await fetch("/api/biz/categories");
        if (res.ok) {
          const data = await res.json();
          const mctFlat: Record<string, string> = {};
          const hpsnFlat: Record<string, string> = {};
          for (const [code, info] of Object.entries(data.mct_ry_cd || {})) {
            const name = (info as { mct_ry_nm?: string })?.mct_ry_nm || "";
            if (name && !name.startsWith("기타")) mctFlat[code] = name;
          }
          for (const [code, info] of Object.entries(data.hpsn_mct_zcd || {})) {
            const name = (info as { hpsn_mct_zcd_nm?: string })?.hpsn_mct_zcd_nm || "";
            if (name && !name.startsWith("기타")) hpsnFlat[code] = name;
          }
          setCategories({ mct_ry_cd: mctFlat, hpsn_mct_zcd: hpsnFlat });
        }
      } catch {
        setError("카테고리 로딩 실패");
        return;
      }
    }

    setMappingModalState({ isOpen: true, resultIndex, mappingType: type });
    setMappingSearchInput("");
  };

  const saveMappingSelection = async (code: string, name: string) => {
    const { resultIndex, mappingType } = mappingModalState;
    if (resultIndex === null || !mappingType) return;

    const newResults = [...allResults];
    const result = newResults[resultIndex];

    if (!result.mapping) result.mapping = {};
    result.mapping[mappingType] = { code, name };
    result.mapping.reasoning = "[사용자 수기입력건]";
    setAllResults(newResults);

    if (result.id) {
      try {
        await fetch("/api/biz/update-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ record_id: result.id, [mappingType]: { code, name } }),
        });
      } catch {
        /* 화면 반영은 유지 */
      }
    }

    setMappingModalState({ isOpen: false, resultIndex: null, mappingType: null });
    setMappingSearchInput("");
    setToastMsg("업종매핑이 수정되었습니다.");
  };

  const saveDataPrefs = () => {
    try {
      localStorage.setItem("dataPreferences", JSON.stringify({
        bizno_fields: selectedBiznoFields, crawl_fields: selectedCrawlFields,
        tele_fields: selectedTeleFields, mapping_fields: selectedMappingFields,
        exclude_errors: excludeErrors,
      }));
    } catch { /* ignore */ }
  };

  const openDataModal = () => {
    if (allResults.length === 0) {
      setError("조회 결과가 없습니다.");
      return;
    }
    try {
      const prefs = JSON.parse(localStorage.getItem("dataPreferences") || "null");
      if (prefs) {
        if (prefs.bizno_fields) setSelectedBiznoFields(prefs.bizno_fields);
        if (prefs.crawl_fields) setSelectedCrawlFields(prefs.crawl_fields);
        if (prefs.tele_fields) setSelectedTeleFields(prefs.tele_fields);
        if (prefs.mapping_fields) setSelectedMappingFields(prefs.mapping_fields);
        if (prefs.exclude_errors !== undefined) setExcludeErrors(prefs.exclude_errors);
      }
    } catch { /* ignore */ }
    setIsDataModalOpen(true);
  };

  const handleDownloadCSV = () => {
    if (!selectedBiznoFields.length && !selectedTeleFields.length && !selectedCrawlFields.length && !selectedMappingFields.length) {
      setError("선택된 필드가 없습니다.");
      return;
    }

    setIsModalLoading(true);
    try {
      const dataToDownload = excludeErrors
        ? allResults.filter((r) => r.api?.bizno?.success !== false || r.api?.gov?.success !== false || r.crawl?.success !== false)
        : allResults;

      if (dataToDownload.length === 0) {
        alert("다운로드할 데이터가 없습니다.");
        return;
      }

      const columns: string[] = ["사업자번호"];
      if (selectedBiznoFields.length > 0) columns.push(...selectedBiznoFields.map((f) => `bizno_${f}`));
      if (selectedCrawlFields.length > 0) columns.push(...selectedCrawlFields.map((f) => `crawl_${f}`));
      if (selectedTeleFields.length > 0) columns.push(...selectedTeleFields.map((f) => `tele_${f}`));
      if (selectedMappingFields.length > 0) columns.push(...selectedMappingFields.map((f) => `mapping_${f}`));

      const rows: string[][] = [columns];

      for (const item of dataToDownload) {
        const row: string[] = [item.brno_formatted || item.brno || ""];

        for (const field of selectedBiznoFields) {
          const biznoItems = item.api?.bizno?.items;
          const val = (biznoItems?.[0] as unknown as Record<string, unknown>)?.[field] ?? "";
          row.push(String(val));
        }

        for (const field of selectedCrawlFields) {
          const searchData = item.crawl?.search || {};
          const detailData = item.crawl?.detail || {};
          let val = "";
          if (field in searchData) {
            val = String(searchData[field] ?? "");
          } else if (field.startsWith("국세청산업분류_") && detailData["국세청산업분류"]) {
            const industryDict = detailData["국세청산업분류"] as Record<string, string>;
            val = String(industryDict[field.replace("국세청산업분류_", "")] ?? "");
          } else {
            val = String((detailData as Record<string, unknown>)[field] ?? "");
          }
          row.push(val);
        }

        for (const field of selectedTeleFields) {
          const govItems = item.api?.gov?.items;
          const val = (govItems?.[0] as Record<string, unknown> | undefined)?.[field] ?? "";
          row.push(String(val));
        }

        for (const field of selectedMappingFields) {
          const mapping = item.mapping;
          let val = "";
          if (field === "mct_ry_cd") val = mapping?.mct_ry_cd?.code ?? "";
          else if (field === "mct_ry_nm") val = mapping?.mct_ry_cd?.name ?? "";
          else if (field === "hpsn_mct_zcd") val = mapping?.hpsn_mct_zcd?.code ?? "";
          else if (field === "hpsn_mct_nm") val = mapping?.hpsn_mct_zcd?.name ?? "";
          row.push(val);
        }

        rows.push(row);
      }

      const csvContent = rows
        .map((row) => row.map((cell) => {
          const s = String(cell ?? "").replace(/"/g, '""');
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
        }).join(","))
        .join("\n");

      const bom = "\uFEFF";
      const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
      link.href = url;
      link.download = `business_lookup_${dataToDownload.length}_${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      saveDataPrefs();
      alert("CSV 다운로드 완료");
      setIsDataModalOpen(false);
    } catch (err) {
      alert("CSV 생성 오류: " + String(err));
    } finally {
      setIsModalLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) { alert("메일 주소를 입력해주세요."); return; }
    const emails = emailAddress.split(";").map((e) => e.trim()).filter((e) => e.includes("@"));
    if (!emails.length) { alert("유효한 메일 주소가 없습니다."); return; }
    if (!selectedBiznoFields.length && !selectedCrawlFields.length && !selectedTeleFields.length && !selectedMappingFields.length) {
      alert("선택된 필드가 없습니다."); return;
    }
    setIsModalLoading(true);
    let successCount = 0, failCount = 0;
    const dataToSend = excludeErrors
      ? allResults.filter((r) => r.api?.bizno?.success !== false || r.api?.gov?.success !== false || r.crawl?.success !== false)
      : allResults;
    for (const email of emails) {
      try {
        const res = await fetch("/api/biz/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email, data: dataToSend, user_id: userId,
            bizno_fields: selectedBiznoFields, tele_fields: selectedTeleFields,
            crawl_fields: selectedCrawlFields, mapping_fields: selectedMappingFields,
          }),
        });
        const json = await res.json();
        if (json.success) successCount++;
        else failCount++;
      } catch { failCount++; }
    }
    setIsModalLoading(false);
    saveDataPrefs();
    alert(failCount === 0
      ? `메일 발송 완료 (${successCount}명, ${dataToSend.length}건)`
      : `발송 결과: 성공 ${successCount}명, 실패 ${failCount}명`);
    if (!failCount) { setIsDataModalOpen(false); setEmailAddress(""); }
  };

  const iqBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: ACCENT, color: "#fff", border: "none",
    borderRadius: 6, padding: "8px 16px", fontSize: "0.875rem",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  });

  const parsedCount = parseBusinessNumbers(bizNumbersInput).length;
  const showMappingCols = performCategoryMapping || allResults.some((r) => r.mapping?.mct_ry_cd?.code || r.mapping?.hpsn_mct_zcd?.code);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 px-4 py-8 sm:py-12">
      {toastMsg && (
        <div style={{ position: "fixed", top: 84, right: 24, background: "#1a1a24", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: "0.8125rem", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 1200 }}>
          {toastMsg}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-[1.5rem] font-bold m-0">사업자번호 매칭/검색</h1>
          <p className="text-xs sm:text-sm text-black/50 mt-1">
            Biz No · 통신판매사업자 · 가맹사업자 조회 결과를 제공합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/biz-lookup/history" className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5">
            조회이력
          </Link>
          {allResults.length > 0 && (
            <button onClick={openDataModal} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: ACCENT }}>
              ⬇ 자료받기
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            ⚠ {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              사업자등록번호
              <span className="text-xs text-black/40 ml-2">(최대 100개) · 줄바꿈 / 쉼표 / 공백으로 구분</span>
            </label>
            <div className="flex gap-3 items-stretch">
              <textarea
                placeholder={"3988701116\n1448118454\n1111111111, 2222222222"}
                value={bizNumbersInput}
                onChange={(e) => setBizNumbersInput(e.target.value)}
                rows={6}
                disabled={isLoading}
                className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm font-mono outline-none focus:border-shinhan-blue disabled:opacity-60"
              />
              <button
                onClick={handleLookup}
                disabled={isLoading || !bizNumbersInput.trim()}
                className="flex flex-col items-center justify-center gap-1 rounded-lg px-6 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: ACCENT, minWidth: 76 }}
              >
                {isLoading ? <span className="animate-spin">◌</span> : <span>🔍</span>}
                <span>조회</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-black/40">입력된 사업자번호: {parsedCount}개</p>
              {statusMessage && <p className="text-xs text-emerald-600 font-medium">{statusMessage}</p>}
            </div>
          </div>

          <div className="rounded-lg bg-black/[.03] p-4 space-y-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={performCategoryMapping}
                onClick={() => setPerformCategoryMapping((v) => !v)}
                disabled={isLoading}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: performCategoryMapping ? ACCENT : "#d4d4d8" }}
              >
                <span
                  className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: performCategoryMapping ? "translateX(20px)" : "translateX(0px)" }}
                />
              </button>
              <label className="cursor-pointer text-sm font-semibold" onClick={() => !isLoading && setPerformCategoryMapping((v) => !v)}>
                업종매핑 동시 진행
              </label>
            </div>
            <p className="text-xs text-black/40 ml-14">
              AI를 활용하여 사업명으로부터 가맹점업종을 자동 분류합니다.
              LLM 토큰이 차감되어 비용이 발생하며, 작업 수행 시간이 소요됩니다.
            </p>
          </div>
        </div>
      </div>

      {streamProgress && (
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="animate-spin" style={{ color: ACCENT }}>◌</span>
              <span className="text-sm font-semibold">
                조회 진행 중 ({streamProgress.completed}/{streamProgress.total}건)
              </span>
            </div>
            {streamProgress.current && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-black/40">처리중:</span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-mono text-blue-700 animate-pulse">
                  {streamProgress.current.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")}
                </span>
              </div>
            )}
            <div className="w-full mt-1">
              <div className="h-1.5 rounded-full bg-black/[.06] overflow-hidden">
                <div className="h-full transition-all duration-300" style={{ width: `${streamProgress.total > 0 ? (streamProgress.completed / streamProgress.total) * 100 : 0}%`, background: ACCENT }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {allResults.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #ebe9f1", borderRadius: 10, padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#8b8b94" }}>조회 결과 ({allResults.length}건)</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", background: "#fff", border: "1px solid #ebe9f1", borderRadius: 10, overflow: "hidden" }}>
              <thead style={{ background: "#f5f5f4", borderBottom: "1px solid #ebe9f1" }}>
                <tr>
                  <th style={{ ...iqThStyle, width: 40, textAlign: "center" }}>No</th>
                  <th style={{ ...iqThStyle, cursor: "pointer" }} onClick={() => handleSort("brno")}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>사업자번호 {sortIcon("brno")}</span>
                  </th>
                  <th style={{ ...iqThStyle, cursor: "pointer" }} onClick={() => handleSort("company_name")}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>상호명 {sortIcon("company_name")}</span>
                  </th>
                  <th style={{ ...iqThStyle, cursor: "pointer" }} onClick={() => handleSort("query_date")}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>조회일자 {sortIcon("query_date")}</span>
                  </th>
                  <th style={iqThStyle}>Bizno API</th>
                  <th style={iqThStyle}>Bizno 크롤링</th>
                  <th style={iqThStyle}>통신판매업</th>
                  <th style={iqThStyle}>가맹사업</th>
                  {showMappingCols && (<><th style={iqThStyle}>가맹점업종</th><th style={iqThStyle}>초개인화업종</th></>)}
                  <th style={{ ...iqThStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result, idx) => {
                  const isExp = expandedResults.has(result.brno);
                  const mctMapping = result.mapping?.mct_ry_cd;
                  const hpsnMapping = result.mapping?.hpsn_mct_zcd;
                  return (
                    <React.Fragment key={result.brno}>
                      <tr>
                        <td style={{ ...iqTdStyle, textAlign: "center", color: "#8b8b94" }}>{idx + 1}</td>
                        <td style={{ ...iqTdStyle, fontWeight: 500 }}>{result.brno_formatted}</td>
                        <td style={iqTdStyle}>{result.company_name || "-"}</td>
                        <td style={{ ...iqTdStyle, whiteSpace: "nowrap", color: "#8b8b94" }}>
                          {formatDate(result.query_date)}
                          {result.is_cached && (
                            <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "#8b8b94", background: "#f5f5f4", border: "1px solid #ebe9f1", borderRadius: 4, padding: "1px 5px" }}>캐시</span>
                          )}
                        </td>
                        <td style={iqTdStyle}>{statusDot(result.api?.bizno?.success, result.api?.bizno?.found)}</td>
                        <td style={iqTdStyle}>{statusDot(result.crawl?.success, result.crawl?.found)}</td>
                        <td style={iqTdStyle}>{statusDot(result.api?.gov?.success, result.api?.gov?.found)}</td>
                        <td style={iqTdStyle}>{statusDot(result.ftc?.success, result.ftc?.found)}</td>
                        {showMappingCols && (
                          <>
                            <td style={{ ...iqTdStyle, cursor: "pointer", userSelect: "none" }} onClick={() => openMappingModal(allResults.indexOf(result), "mct_ry_cd")} title="클릭하여 편집">
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "#8b8b94", flexShrink: 0, marginTop: 3 }}>✎</span>
                                {mctMapping?.code
                                  ? <div>{mctMapping.code}<br /><span style={{ color: "#8b8b94" }}>{mctMapping.name}</span></div>
                                  : <span style={{ color: "#8b8b94" }}>없음</span>}
                              </div>
                            </td>
                            <td style={{ ...iqTdStyle, cursor: "pointer", userSelect: "none" }} onClick={() => openMappingModal(allResults.indexOf(result), "hpsn_mct_zcd")} title="클릭하여 편집">
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "#8b8b94", flexShrink: 0, marginTop: 3 }}>✎</span>
                                {hpsnMapping?.code
                                  ? <div style={{ fontSize: "0.8rem" }}>{hpsnMapping.code}<br /><span style={{ color: "#8b8b94" }}>{hpsnMapping.name}</span></div>
                                  : <span style={{ color: "#8b8b94", fontSize: "0.8rem" }}>없음</span>}
                              </div>
                            </td>
                          </>
                        )}
                        <td style={{ ...iqTdStyle, textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            {(mctMapping?.code || hpsnMapping?.code) && (
                              <MiniPopover trigger={<span style={{ cursor: "pointer", color: "#c4c4c4", fontSize: "0.9rem" }} title="매핑사유">ⓘ</span>}>
                                <p style={{ fontWeight: 600, fontSize: "0.75rem", color: "#8b8b94", marginBottom: 4 }}>매핑사유</p>
                                <p>{result.mapping?.reasoning || "사유 없음"}</p>
                              </MiniPopover>
                            )}
                            <button
                              onClick={() => toggleExpand(result.brno)}
                              style={{ background: "transparent", color: "#8b8b94", border: "1px solid #ebe9f1", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                            >
                              {isExp ? "▲" : "▼"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExp && (
                        <tr key={`detail-${result.brno}`}>
                          <td colSpan={showMappingCols ? 11 : 9} style={{ padding: 0, border: "none" }}>
                            <ResultDetailContent result={result} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isDataModalOpen && (
        <div onClick={() => setIsDataModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 620, width: "90%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 25px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: "1.125rem", fontWeight: 700 }}>조회 결과 받기</span>
              <button onClick={() => setIsDataModalOpen(false)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#8b8b94" }}>✕</button>
            </div>
            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #ebe9f1" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.875rem", fontWeight: 500 }}>
                <input type="checkbox" checked={excludeErrors} onChange={(e) => setExcludeErrors(e.target.checked)} />오류건 제외
              </label>
            </div>
            <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #ebe9f1" }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: 12 }}>조회 데이터 선택</label>
              <IqFieldGroup title="Bizno API" fields={IQ_BIZNO_FIELDS} sel={selectedBiznoFields} setSel={setSelectedBiznoFields} />
              <IqFieldGroup title="Bizno 크롤링" fields={IQ_CRAWL_FIELDS} sel={selectedCrawlFields} setSel={setSelectedCrawlFields} />
              <IqFieldGroup title="통신판매업 API" fields={IQ_TELE_FIELDS} sel={selectedTeleFields} setSel={setSelectedTeleFields} />
            </div>
            {showMappingCols && (
              <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #ebe9f1" }}>
                <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: 12 }}>업종매핑 결과</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {IQ_MAPPING_FIELDS.map((f) => (
                    <label key={f.value} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.8rem" }}>
                      <input type="checkbox" checked={selectedMappingFields.includes(f.value)} onChange={() => iqToggle(f.value, selectedMappingFields, setSelectedMappingFields)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: 8 }}>메일로 받기</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="email@example.com; email2@example.com (세미콜론으로 구분)"
                  style={{ flex: 1, padding: "8px 12px", border: "1px solid #ebe9f1", borderRadius: 6, fontSize: "0.875rem", outline: "none" }} />
                <button onClick={handleSendEmail} disabled={isModalLoading} style={iqBtnStyle(isModalLoading)}>📧 메일 발송</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={handleDownloadCSV} disabled={isModalLoading} style={iqBtnStyle(isModalLoading)}>CSV 다운로드</button>
              <button onClick={() => setIsDataModalOpen(false)} style={{ background: "#f5f5f4", color: "#1a1a24", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: "0.875rem", cursor: "pointer" }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {mappingModalState.isOpen && (
        <div onClick={() => setMappingModalState({ isOpen: false, resultIndex: null, mappingType: null })} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 420, width: "90%", boxShadow: "0 20px 25px rgba(0,0,0,0.15)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "1.125rem", fontWeight: 700 }}>업종 선택</h3>
            <input
              placeholder="검색..."
              value={mappingSearchInput}
              onChange={(e) => setMappingSearchInput(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #ebe9f1", borderRadius: 6, fontSize: "0.875rem", marginBottom: 12, boxSizing: "border-box" }}
            />
            <div style={{ border: "1px solid #ebe9f1", borderRadius: 8, overflowY: "auto", maxHeight: 260 }}>
              {!categories || !mappingModalState.mappingType ? (
                <div style={{ padding: 16, textAlign: "center", color: "#8b8b94" }}>로딩 중...</div>
              ) : (
                Object.entries(categories[mappingModalState.mappingType] || {})
                  .filter(([code, name]) =>
                    !mappingSearchInput ||
                    code.toLowerCase().includes(mappingSearchInput.toLowerCase()) ||
                    (name && name.toLowerCase().includes(mappingSearchInput.toLowerCase()))
                  )
                  .slice(0, 100)
                  .map(([code, name]) => (
                    <button
                      key={code}
                      onClick={() => saveMappingSelection(code, name)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #ebe9f1", padding: "10px 12px", cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f4")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <div style={{ fontFamily: "monospace", fontSize: "0.875rem", fontWeight: 500 }}>{code}</div>
                      <div style={{ fontSize: "0.75rem", color: "#8b8b94" }}>{name}</div>
                    </button>
                  ))
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setMappingModalState({ isOpen: false, resultIndex: null, mappingType: null })} style={{ background: "#f5f5f4", color: "#1a1a24", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: "0.875rem", cursor: "pointer" }}>취소</button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        title="맨 위로"
        style={{ position: "fixed", bottom: 28, right: 28, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", zIndex: 100 }}
      >
        <span style={{ color: "#6b7280" }}>↑</span>
      </button>
    </div>
  );
}
