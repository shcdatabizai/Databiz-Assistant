import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";
import { listSharedDrive } from "@/lib/googleDrive";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const folderId = new URL(request.url).searchParams.get("folderId")?.trim() ?? "";
  const serviceAccountJson = await resolveApiKey("GOOGLE_SERVICE_ACCOUNT_JSON", user.id);
  if (!serviceAccountJson) {
    return NextResponse.json(
      { error: "Google 서비스 계정 JSON이 없습니다. API 키 관리에서 JSON 파일을 먼저 등록하세요." },
      { status: 400 }
    );
  }

  try {
    const listed = await listSharedDrive(serviceAccountJson, folderId || undefined);
    return NextResponse.json(listed);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
