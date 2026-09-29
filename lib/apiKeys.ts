import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";

/**
 * API 키 우선순위 해석: 개인 키(use_admin_default=false) > 관리자 기본 키
 * (개인 키가 없거나 use_admin_default=true인 경우) > 없음.
 * 항상 서버 코드에서만 호출하세요 (복호화된 평문을 반환합니다).
 */
export async function resolveApiKey(
  keyName: string,
  userId?: string | null
): Promise<string | null> {
  const admin = createAdminClient();

  if (userId) {
    const { data: userKey } = await admin
      .from("user_api_keys")
      .select("key_value_encrypted, use_admin_default")
      .eq("user_id", userId)
      .eq("key_name", keyName)
      .maybeSingle();

    if (userKey && !userKey.use_admin_default) {
      return decryptSecret(userKey.key_value_encrypted);
    }
  }

  const { data: adminKey } = await admin
    .from("admin_api_keys")
    .select("key_value_encrypted")
    .eq("key_name", keyName)
    .maybeSingle();

  if (adminKey) {
    return decryptSecret(adminKey.key_value_encrypted);
  }

  return null;
}
