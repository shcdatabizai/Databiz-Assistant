import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { API_KEY_DEFS } from "@/lib/apiKeyDefs";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_api_keys")
    .select("key_name, key_value_encrypted, updated_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byKey = new Map(data?.map((row) => [row.key_name, row]));

  const keys = API_KEY_DEFS.map((def) => {
    const row = byKey.get(def.key);
    let masked: string | null = null;
    if (row) {
      try {
        masked = maskSecret(decryptSecret(row.key_value_encrypted));
      } catch {
        masked = "••••(복호화 실패)";
      }
    }
    return {
      ...def,
      hasValue: !!row,
      masked,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return NextResponse.json({ keys });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
  }

  const body = await request.json();
  const { key, value } = body as { key?: string; value?: string };

  if (!key || typeof value !== "string") {
    return NextResponse.json({ error: "key, value가 필요합니다." }, { status: 400 });
  }

  const def = API_KEY_DEFS.find((d) => d.key === key);
  if (!def) {
    return NextResponse.json({ error: `알 수 없는 키: ${key}` }, { status: 400 });
  }

  const admin = createAdminClient();

  if (value.trim() === "") {
    const { error } = await admin.from("admin_api_keys").delete().eq("key_name", key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const encrypted = encryptSecret(value.trim());
  const { error } = await admin.from("admin_api_keys").upsert({
    key_name: key,
    key_value_encrypted: encrypted,
    description: def.usage,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, masked: maskSecret(value.trim()) });
}
