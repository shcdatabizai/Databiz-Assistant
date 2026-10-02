"use client";

import { useEffect, useState } from "react";
import { DriveFilePicker } from "@/components/DriveFilePicker";

interface SavedMonth {
  year_month: string;
  updated_at: string;
}

interface DashboardRow {
  year_month: string;
  drive_file_id: string;
  drive_file_name: string | null;
  status: string;
  error_message: string | null;
  uploaded_at: string;
}

function ym6(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 6);
}

export default function AdminDataPage() {
  const [savedMonths, setSavedMonths] = useState<SavedMonth[]>([]);
  const [amtFileId, setAmtFileId] = useState("");
  const [demoFileId, setDemoFileId] = useState("");
  const [kSaving, setKSaving] = useState(false);
  const [kMsg, setKMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [overlap, setOverlap] = useState<string[] | null>(null);
  const [missingMonths, setMissingMonths] = useState<string[]>([]);

  // Dashboard
  const [dashRows, setDashRows] = useState<DashboardRow[]>([]);
  const [dYm, setDYm] = useState("");
  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [dSaving, setDSaving] = useState(false);
  const [dMsg, setDMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function loadKosis() {
    fetch("/api/admin/data/kosis-shc")
      .then((r) => r.json())
      .then((b) => {
        if (b.error) {
          setKMsg({ text: b.error, ok: false });
          return;
        }
        setSavedMonths(b.months ?? []);
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

  useEffect(() => {
    if (!dashRows.some((row) => row.status === "registered" || row.status === "processing")) return;
    const timer = setInterval(loadDashboard, 8000);
    return () => clearInterval(timer);
  }, [dashRows]);

  async function submitKosis(overwrite = false) {
    setKSaving(true);
    setKMsg(null);
    try {
      const res = await fetch("/api/admin/data/kosis-shc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amtFileId, demoFileId, overwrite }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "저장 실패");
      setMissingMonths(body.missing ?? []);
      if (body.needConfirm) {
        setOverlap(body.overlap ?? []);
        if (body.saved || body.kosisMonths) {
          setKMsg({
            text: `새 달과 비어 있던 통계청 ${body.kosisMonths ?? 0}개월은 저장했습니다. 이미 있는 신한카드 월은 아래에서 덮어쓸지 고릅니다.`,
            ok: true,
          });
        }
        return;
      }
      setOverlap(null);
      const [from, to] = body.range ?? [];
      setKMsg({
        text: `${body.saved ?? 0}개월을 저장했습니다.${from && to ? ` (${from}~${to})` : ""}${body.overwritten ? ` 기존 ${body.overwritten}개월의 신한카드 값은 덮어썼습니다.` : ""} ${body.kosisMonths ? `통계청은 없던 ${body.kosisMonths}개월만 조회했습니다.` : "통계청은 저장된 값을 그대로 썼습니다."}`,
        ok: true,
      });
      setAmtFileId("");
      setDemoFileId("");
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
        body: JSON.stringify({ yearMonth: ym6(dYm), fileId, fileName: fileName || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "등록 실패");
      setDMsg({
        text: body.warning ?? body.message ?? `집계 실행을 요청했습니다. (파일 ID: ${body.fileId})`,
        ok: !body.warning,
      });
      setDYm("");
      setFileId("");
      setFileName("");
      loadDashboard();
    } catch (e) {
      setDMsg({ text: (e as Error).message, ok: false });
    } finally {
      setDSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* KOSIS-신한카드 */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-foreground">
          📊 KOSIS-신한카드 데이터 비교 — shc_amt, shc_demo 등록
        </h2>
        <p className="mb-4 text-sm text-black/55">
          금액 파일과 인구 파일을 고르면 업종별로 맞춰 월별 숫자만 저장합니다. 정합성 화면은 이 저장값을 읽습니다.
          기준년월은 파일 안에서 읽습니다.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitKosis(false);
          }}
          className="mb-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <p className="mb-1 text-xs text-black/50">금액 파일 (shc_amt)</p>
            <DriveFilePicker
              fileId={amtFileId}
              onChange={(file) => setAmtFileId(file?.id ?? "")}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-black/50">인구 파일 (shc_demo)</p>
            <DriveFilePicker
              fileId={demoFileId}
              onChange={(file) => setDemoFileId(file?.id ?? "")}
            />
          </div>
          <button
            type="submit"
            disabled={kSaving || !amtFileId || !demoFileId}
            className="rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
          >
            {kSaving ? "저장 중..." : "월별 값 저장"}
          </button>
        </form>
        {overlap ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
              <h3 className="text-base font-semibold">같은 기간이 이미 있습니다</h3>
              <p className="mt-2 text-sm leading-relaxed text-black/70">
                파일에 들어 있는 달 중 {overlap.length}개월
                {overlap[0] ? ` (${overlap[0]}~${overlap[overlap.length - 1]})` : ""}
                이 이미 저장되어 있습니다. 그 달을 덮어쓸까요? 파일에 없는 달은 그대로 둡니다.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm"
                  onClick={() => setOverlap(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={kSaving}
                  className="rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() => void submitKosis(true)}
                >
                  덮어쓰기
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {kMsg && (
          <p className={`mb-3 text-sm ${kMsg.ok ? "text-emerald-600" : "text-amber-600"}`}>{kMsg.text}</p>
        )}

        <p className="mb-2 text-sm text-black/55">
          저장된 월 {savedMonths.length}개
          {savedMonths.length > 0
            ? ` (${savedMonths[savedMonths.length - 1].year_month}~${savedMonths[0].year_month})`
            : ""}
        </p>
        <div className="max-h-64 overflow-auto rounded-xl border border-black/5">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#fafafa] text-black/50">
              <tr>
                <th className="px-3 py-2">기준월</th>
                <th className="px-3 py-2">저장 시각</th>
              </tr>
            </thead>
            <tbody>
              {savedMonths.map((row) => (
                <tr key={row.year_month} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium">{row.year_month}</td>
                  <td className="px-3 py-2">{new Date(row.updated_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
              {savedMonths.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-center text-black/40">
                    저장된 월이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {missingMonths.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-amber-700">
            {missingMonths.map((month) => (
              <li key={month}>
                {month.slice(0, 4)}.{month.slice(4)} 데이터가 누락되어있습니다.
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 월별 소비데이터 현황 */}
      <section>
        <h2 className="mb-1 text-base font-semibold text-foreground">
          📈 월별 소비데이터 현황 — 원본 데이터 등록 (Google Drive)
        </h2>
        <p className="mb-4 text-sm text-black/55">
          서비스 계정에 공유된 Drive 폴더에서 월별 parquet을 고르면 대시보드 집계가 실행되고,
          결과만 저장됩니다. 파일 링크를 따로 붙이지 않아도 됩니다.
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
          <DriveFilePicker
            fileId={fileId}
            onChange={(file) => {
              setFileId(file?.id ?? "");
              setFileName(file?.name ?? "");
            }}
          />
          <button
            type="submit"
            disabled={dSaving}
            className="rounded-lg bg-shinhan-blue px-4 py-2 text-sm font-medium text-white hover:bg-shinhan-blue-dark disabled:opacity-50"
          >
            {dSaving ? "생성 요청 중..." : "이 파일로 대시보드 생성"}
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
                <th className="px-3 py-2">오류</th>
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
                  <td className="px-3 py-2 text-black/50">{r.error_message ?? "-"}</td>
                  <td className="px-3 py-2">{new Date(r.uploaded_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
              {dashRows.length === 0 && (
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
    </div>
  );
}
