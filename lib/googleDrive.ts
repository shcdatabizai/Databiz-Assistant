import "server-only";
import { createSign } from "crypto";

/** 다양한 형태의 Google Drive 공유 링크에서 파일 ID를 추출합니다. */
export function extractDriveFileId(link: string): string | null {
  const trimmed = link.trim();

  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // https://drive.google.com/open?id=FILE_ID  또는  ...?id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];

  // 링크가 아니라 파일 ID를 직접 붙여넣은 경우 (25자 이상의 영숫자/-/_ 조합)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  return null;
}

interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Google 서비스 계정 JSON(private_key 포함)으로 JWT를 생성해
 * OAuth2 access token을 발급받습니다 (googleapis 패키지 없이 순수 fetch+crypto로 구현).
 */
async function getServiceAccountAccessToken(
  serviceAccountJsonRaw: string,
  scope = "https://www.googleapis.com/auth/drive.readonly"
): Promise<string> {
  let sa: ServiceAccountJson;
  try {
    sa = JSON.parse(serviceAccountJsonRaw);
  } catch {
    throw new Error("Google 서비스 계정 JSON 형식이 올바르지 않습니다.");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("서비스 계정 JSON에 client_email/private_key가 없습니다.");
  }

  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(sa.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`Google 인증 토큰 발급 실패: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body.access_token as string;
}

export interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function listDriveQuery(accessToken: string, query: string): Promise<DriveEntry[]> {
  const items: DriveEntry[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size)");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(`Google Drive 목록 조회 실패 (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
    }
    for (const file of body.files ?? []) {
      items.push({
        id: String(file.id),
        name: String(file.name ?? ""),
        mimeType: String(file.mimeType ?? ""),
        size: file.size ? Number(file.size) : null,
      });
    }
    pageToken = body.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 서비스 계정에 공유된 폴더와 parquet/csv 파일 목록입니다. folderId가 있으면 그 폴더 안만 봅니다. */
export async function listSharedDrive(serviceAccountJsonRaw: string, folderId?: string) {
  if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    throw new Error("폴더 ID 형식이 올바르지 않습니다.");
  }
  const accessToken = await getServiceAccountAccessToken(serviceAccountJsonRaw);
  const dataFile =
    "(name contains '.parquet' or name contains '.csv' or name contains '.PARQUET' or name contains '.CSV')";
  const [folders, files] = await Promise.all([
    listDriveQuery(accessToken, `trashed = false and mimeType = '${FOLDER_MIME}'`),
    listDriveQuery(
      accessToken,
      folderId
        ? `'${folderId}' in parents and trashed = false and ${dataFile}`
        : `trashed = false and mimeType != '${FOLDER_MIME}' and ${dataFile}`
    ),
  ]);
  return { folders, files };
}

/** 화면에서 고른 파일 ID 또는 기존 공유 링크에서 파일 ID를 확정합니다. */
export function resolveSubmittedFileId(fileId?: string, driveLink?: string): string | null {
  const direct = fileId?.trim() ?? "";
  if (/^[a-zA-Z0-9_-]{20,}$/.test(direct)) return direct;
  if (driveLink) return extractDriveFileId(driveLink);
  return null;
}

/**
 * 서비스 계정 권한으로 Google Drive 파일을 다운로드합니다.
 * 대상 파일/폴더는 서비스 계정 이메일(client_email)과 "뷰어"로 공유되어 있어야 합니다.
 */
export async function downloadDriveFile(
  fileId: string,
  serviceAccountJsonRaw: string
): Promise<ArrayBuffer> {
  const accessToken = await getServiceAccountAccessToken(serviceAccountJsonRaw);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive 파일 다운로드 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.arrayBuffer();
}
