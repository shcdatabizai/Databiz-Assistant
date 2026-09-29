import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { API_KEY_DEFS } from "@/lib/apiKeyDefs";

/**
 * 화면에는 절대 표시하지 않고, 클립보드 복사 용도로만 평문 값을 반환합니다.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || !API_KEY_DEFS.some((d) => d.key === key)) {
    return NextResponse.json({ error: `알 수 없는 키: ${key}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_api_keys")
    .select("key_value_encrypted")
    .eq("key_name", key)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "등록된 값이 없습니다." }, { status: 404 });

  try {
    const value = decryptSecret(data.key_value_encrypted);
    return NextResponse.json({ value });
  } catch {
    return NextResponse.json({ error: "복호화에 실패했습니다." }, { status: 500 });
  }
}
