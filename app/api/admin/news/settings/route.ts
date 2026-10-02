import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { NEWS_GITHUB_KEY_DEFS } from "@/lib/apiKeyDefs";
import { NEWS_SETTINGS_KEY, normalizeNewsSettings, parseNewsSettings } from "@/lib/newsSettings";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_api_keys")
    .select("key_value_encrypted")
    .eq("key_name", NEWS_SETTINGS_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: githubRows, error: githubError } = await admin
    .from("admin_api_keys")
    .select("key_name, key_value_encrypted")
    .in(
      "key_name",
      NEWS_GITHUB_KEY_DEFS.map((def) => def.key)
    );
  if (githubError) return NextResponse.json({ error: githubError.message }, { status: 500 });

  const githubByKey = new Map((githubRows ?? []).map((row) => [row.key_name, row]));
  const githubKeys = NEWS_GITHUB_KEY_DEFS.map((def) => {
    const row = githubByKey.get(def.key);
    let masked: string | null = null;
    if (row) {
      try {
        masked = maskSecret(decryptSecret(row.key_value_encrypted));
      } catch {
        masked = "••••(복호화 실패)";
      }
    }
    return { key: def.key, label: def.label, placeholder: def.placeholder ?? "값 입력", hasValue: !!row, masked };
  });

  if (!data) return NextResponse.json({ settings: parseNewsSettings(null), saved: false, githubKeys });

  try {
    return NextResponse.json({
      settings: parseNewsSettings(decryptSecret(data.key_value_encrypted)),
      saved: true,
      githubKeys,
    });
  } catch {
    return NextResponse.json({ error: "저장된 설정을 읽지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "설정 값이 필요합니다." }, { status: 400 });
  }

  const settings = normalizeNewsSettings(body);
  const admin = createAdminClient();
  const { error } = await admin.from("admin_api_keys").upsert({
    key_name: NEWS_SETTINGS_KEY,
    key_value_encrypted: encryptSecret(JSON.stringify(settings)),
    description: "데이터뉴스 자동수집 설정",
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, settings });
}
