"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KosisRow {
  year_month: string;
  shc_total: number | null;
  shc_medical: number | null;
  total_index: number | null;
  kosis_total: number | null;
  kosis_medicine: number | null;
  kosis_fetched_at: string | null;
}

interface KosisUploadRow {
  year_month: string;
  drive_file_name: string | null;
  status: string;
  row_count: number | null;
  error_message: string | null;
  uploaded_at: string;
}

interface DashboardRow {
  year_month: string;
  drive_file_id: string;
  drive_file_name: string | null;
  status: string;
  uploaded_at: string;
}

function ym6(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 6);
}

export default function AdminDataPage() {
  // 데이터뉴스 수집 (기능3)
  const [crawlDays, setCrawlDays] = useState("7");
  const [crawlExtra, setCrawlExtra] = useState("");
  const [crawlTriggering, setCrawlTriggering] = useState(false);
  const [crawlMsg, setCrawlMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // KOSIS-SHC
  const [kosisRows, setKosisRows] = useState<KosisRow[]>([]);
  const [kosisUploads, setKosisUploads] = useState<KosisUploadRow[]>([]);
  const [kYm, setKYm] = useState("");
  const [kDriveLink, setKDriveLink] = useState("");
  const [kFileName, setKFileName] = useState("");
  const [kSaving, setKSaving] = useState(false);
  const [kMsg, setKMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Dashboard
  const [dashRows, setDashRows] = useState<DashboardRow[]>([]);
  const [dYm, setDYm] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [fileName, setFileName] = useState("");
  const [dSaving, setDSaving] = useState(false);
  const [dMsg, setDMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function loadKosis() {
    fetch("/api/admin/data/kosis-shc")
      .then((r) => r.json())
      .then((b) => {
        setKosisRows(b.rows ?? []);
        setKosisUploads(b.uploads ?? []);
      });
  }
  function loadDashboard() {
    fetch("/api/admin/data/dashboard")
      .then((r) => r.json())
      .then((b) => setDashRows(b.rows ?? []));
  }

  useEffect(() => {
    loadKosis();
    loadDashboard();
  }, []);

  async function submitKosis(e: React.FormEvent) {
    e.preventDefault();
    setKSaving(true);
    setKMsg(null);
    try {
      const res = await fetch("/api/admin/data/kosis-shc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth: ym6(kYm),
          driveLink: kDriveLink,
          fileName: kFileName || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      setKMsg({ text: body.warning ?? "파일 다운로드/집계 + KOSIS 병합 완료", ok: !body.warning });
      setKYm("");
      setKDriveLink("");
      setKFileName("");
      loadKosis();
    } catch (e) {
      setKMsg({ text: (e as Error).message, ok: false });
    } finally {
      setKSaving(false);
    }
  }

  async function submitDashboard(e: React.FormEvent) {
    e.preventDefault();
    setDSaving(true);
    setDMsg(null);
    try {
      const res = await fetch("/api/admin/data/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth: ym6(dYm), driveLink, fileName: fileName || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "등록 실패");
      setDMsg({ text: `등록 완료 (파일 ID: ${body.fileId})`, ok: true });
      setDYm("");
      setDriveLink("");
      setFileName("");
      loadDashboard();
    } catch (e) {
      setDMsg({ text: (e as Error).message, ok: false });
    } finally {
      setDSaving(false);
    }
  }

  async function triggerCrawl() {
    setCrawlTriggering(true);
    setCrawlMsg(null);
    try {
      const res = await fetch("/api/admin/news/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: Number(crawlDays) || 7, extraKeywords: crawlExtra }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "실행 요청 실패");
      setCrawlMsg({ text: body.message ?? "실행 요청 완료", ok: true });
    } catch (e) {
      setCrawlMsg({ text: (e as Error).message, ok: false });
    } finally {
      setCrawlTriggering(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* 데이터뉴스 수집 (기능3) */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>데이터뉴스 수집 — 수동 실행</CardTitle>
            <CardDescription>
              평소에는 GitHub Actions가 매주 자동으로 수집하지만, 필요하면 여기서 즉시 실행을
              요청할 수 있습니다. GITHUB_PAT / GITHUB_REPO 키가 /admin/api-keys 에 등록되어
              있어야 합니다. 실행 결과는 몇 분 후 데이터뉴스 페이지에 반영됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="mb-1.5 block text-xs text-black/50">수집 기간(일)</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={crawlDays}
                  onChange={(e) => setCrawlDays(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <Label className="mb-1.5 block text-xs text-black/50">추가 키워드 (쉼표 구분, 선택)</Label>
                <Input
                  placeholder="축제,이벤트"
                  value={crawlExtra}
                  onChange={(e) => setCrawlExtra(e.target.value)}
                />
              </div>
              <Button onClick={triggerCrawl} disabled={crawlTriggering}>
                {crawlTriggering ? "요청 중..." : "지금 수집 실행"}
              </Button>
            </div>
            {crawlMsg && (
              <p className={`mt-3 text-sm ${crawlMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
                {crawlMsg.text}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* KOSIS-신한카드 */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-foreground">
          KOSIS-신한카드 데이터 비교 — 월별 신한카드 원본 데이터 등록 (Google Drive)
        </h2>
        <p className="mb-4 text-sm text-black/55">
          신한카드 업종별 취급액 원본 parquet 파일을 관리자 Google Drive 공유 폴더에 업로드한 뒤,
          공유 링크와 기준월을 등록하세요. 서버가 서비스 계정으로 파일을 다운로드해 전체업종/의료
          취급액을 집계하고, 등록된 KOSIS API 키로 같은 기준월의 통계청 수치를 자동 조회해 병합합니다.
        </p>
        <form onSubmit={submitKosis} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-black/50">기준년월 (YYYYMM)</label>
            <input
              required
              placeholder="202608"
              value={kYm}
              onChange={(e) => setKYm(e.target.value)}
              className="w-32 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs text-black/50">Google Drive 공유 링크</label>
            <input
              required
              placeholder="https://drive.google.com/file/d/..."
              value={kDriveLink}
              onChange={(e) => setKDriveLink(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-black/50">파일명 (선택)</label>
            <input
              placeholder="shc_detail_202608.parquet"
              value={kFileName}
              onChange={(e) => setKFileName(e.target.value)}
              className="w-56 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <button
            type="submit"
            disabled={kSaving}
            className="rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
          >
            {kSaving ? "다운로드/집계 중..." : "등록 + 집계 + KOSIS 병합"}
          </button>
        </form>
        {kMsg && (
          <p className={`mb-3 text-sm ${kMsg.ok ? "text-emerald-600" : "text-amber-600"}`}>{kMsg.text}</p>
        )}

        <div className="mb-4 overflow-x-auto rounded-xl border border-black/5">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/[.02] text-black/50">
              <tr>
                <th className="px-3 py-2">기준월</th>
                <th className="px-3 py-2">파일명</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">행 수</th>
                <th className="px-3 py-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {kosisUploads.map((r) => (
                <tr key={r.year_month} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium">{r.year_month}</td>
                  <td className="px-3 py-2">{r.drive_file_name ?? "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.status === "done"
                          ? "text-emerald-600"
                          : r.status === "error"
                            ? "text-red-500"
                            : "text-amber-600"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.row_count?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2 text-black/50">{r.error_message ?? "-"}</td>
                </tr>
              ))}
              {kosisUploads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-black/40">
                    등록된 원본 파일이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-black/5">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/[.02] text-black/50">
              <tr>
                <th className="px-3 py-2">기준월</th>
                <th className="px-3 py-2">총지수</th>
                <th className="px-3 py-2">KOSIS 합계</th>
                <th className="px-3 py-2">KOSIS 의약품</th>
                <th className="px-3 py-2">신한 전체업종</th>
                <th className="px-3 py-2">신한 의료</th>
              </tr>
            </thead>
            <tbody>
              {kosisRows.map((r) => (
                <tr key={r.year_month} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium">{r.year_month}</td>
                  <td className="px-3 py-2">{r.total_index ?? "-"}</td>
                  <td className="px-3 py-2">{r.kosis_total?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">{r.kosis_medicine?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">{r.shc_total?.toLocaleString() ?? "-"}</td>
                  <td className="px-3 py-2">{r.shc_medical?.toLocaleString() ?? "-"}</td>
                </tr>
              ))}
              {kosisRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-black/40">
                    등록된 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 월별 소비데이터 현황 */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-foreground">
          월별 소비데이터 현황 — 원본 데이터 등록 (Google Drive)
        </h2>
        <p className="mb-4 text-sm text-black/55">
          원본 parquet/csv 파일을 관리자 Google Drive의 공유 폴더에 업로드한 뒤, 공유 링크와
          기준월을 등록하세요. 서버는 등록된 서비스 계정으로 해당 파일을 읽어 대시보드를 생성합니다.
        </p>
        <form onSubmit={submitDashboard} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-black/50">기준년월 (YYYYMM)</label>
            <input
              required
              placeholder="202608"
              value={dYm}
              onChange={(e) => setDYm(e.target.value)}
              className="w-32 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs text-black/50">Google Drive 공유 링크</label>
            <input
              required
              placeholder="https://drive.google.com/file/d/..."
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-black/50">파일명 (선택)</label>
            <input
              placeholder="IDX_01_202608.parquet"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-56 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
            />
          </div>
          <button
            type="submit"
            disabled={dSaving}
            className="rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
          >
            {dSaving ? "등록 중..." : "등록"}
          </button>
        </form>
        {dMsg && (
          <p className={`mb-3 text-sm ${dMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{dMsg.text}</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-black/5">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/[.02] text-black/50">
              <tr>
                <th className="px-3 py-2">기준월</th>
                <th className="px-3 py-2">파일명</th>
                <th className="px-3 py-2">Drive 파일 ID</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">등록일시</th>
              </tr>
            </thead>
            <tbody>
              {dashRows.map((r) => (
                <tr key={r.year_month} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium">{r.year_month}</td>
                  <td className="px-3 py-2">{r.drive_file_name ?? "-"}</td>
                  <td className="px-3 py-2 font-mono">{r.drive_file_id}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{new Date(r.uploaded_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
              {dashRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-black/40">
                    등록된 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
