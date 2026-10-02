import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  DEFAULT_SHARED_FAVORITES,
  SHARED_FAVORITES_KEY,
  inferFavoriteIcon,
  normalizeFavorites,
  parseSharedFavorites,
  type SharedFavorite,
} from "@/lib/sharedFavorites";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

async function readStored() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_api_keys")
    .select("key_value_encrypted")
    .eq("key_name", SHARED_FAVORITES_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { items: DEFAULT_SHARED_FAVORITES.map((item) => ({ ...item })), saved: false };
  try {
    return { items: parseSharedFavorites(decryptSecret(data.key_value_encrypted)), saved: true };
  } catch {
    throw new Error("저장된 즐겨찾기를 읽지 못했습니다.");
  }
}

async function writeStored(items: SharedFavorite[], userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_api_keys").upsert({
    key_name: SHARED_FAVORITES_KEY,
    key_value_encrypted: encryptSecret(JSON.stringify(items)),
    description: "부서 공용계정 즐겨찾기",
    updated_by: userId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function GET() {
  try {
    const stored = await readStored();
    return NextResponse.json(stored);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "관리자만 수정할 수 있습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const rawItems = body && typeof body === "object" ? (body as { items?: unknown }).items : null;
  const items = normalizeFavorites(rawItems);
  if (!Array.isArray(rawItems) || items.length !== rawItems.length || items.length === 0) {
    return NextResponse.json({ error: "사이트명과 http(s) URL을 모두 입력해주세요." }, { status: 400 });
  }

  try {
    await writeStored(items, user.id);
    return NextResponse.json({ items, saved: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "관리자만 추가할 수 있습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const draft = normalizeFavorites([
    {
      ...(body && typeof body === "object" ? body : {}),
      id: crypto.randomUUID(),
      icon: inferFavoriteIcon(typeof body?.url === "string" ? body.url : ""),
    },
  ]);
  if (draft.length !== 1) {
    return NextResponse.json({ error: "사이트명과 http(s) URL이 필요합니다." }, { status: 400 });
  }

  try {
    const stored = await readStored();
    const items = [...stored.items, draft[0]];
    await writeStored(items, user.id);
    return NextResponse.json({ items, saved: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
