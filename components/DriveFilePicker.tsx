"use client";

import { useEffect, useState } from "react";

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
  size: number | null;
}

function formatSize(size: number | null) {
  if (!size) return "";
  const mb = size / (1024 * 1024);
  if (mb >= 1) return ` (${Math.round(mb)}MB)`;
  return ` (${Math.max(1, Math.round(size / 1024))}KB)`;
}

export function DriveFilePicker({
  fileId,
  onChange,
}: {
  fileId: string;
  onChange: (file: { id: string; name: string } | null) => void;
}) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folderId, setFolderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
    setLoading(true);
    fetch(`/api/admin/data/drive${params}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Drive 목록을 불러오지 못했습니다.");
        setFolders(body.folders ?? []);
        setFiles(body.files ?? []);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [folderId]);

  return (
    <div className="flex min-w-[280px] flex-1 flex-col gap-2">
      <div>
        <label className="mb-1 block text-xs text-black/50">Drive 폴더</label>
        <select
          value={folderId}
          onChange={(event) => {
            setFolderId(event.target.value);
            onChange(null);
          }}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
        >
          <option value="">공유된 데이터 파일 전체</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-black/50">추가할 파일</label>
        <select
          required
          value={fileId}
          onChange={(event) => {
            const next = files.find((file) => file.id === event.target.value);
            onChange(next ? { id: next.id, name: next.name } : null);
          }}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-shinhan-blue"
        >
          <option value="">{loading ? "불러오는 중..." : "파일을 선택하세요"}</option>
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.name}
              {formatSize(file.size)}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {!loading && !error && files.length === 0 ? (
        <p className="text-xs text-black/45">이 범위에서 parquet 또는 csv 파일을 찾지 못했습니다.</p>
      ) : null}
    </div>
  );
}
