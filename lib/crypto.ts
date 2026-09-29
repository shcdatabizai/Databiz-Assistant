import "server-only";
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("API_KEY_ENCRYPTION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  // 32바이트 키로 정규화 (base64/임의 문자열 모두 허용)
  return crypto.createHash("sha256").update(secret).digest();
}

/** 평문 → "iv:authTag:ciphertext" (모두 base64) */
export function encryptSecret(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** "iv:authTag:ciphertext" → 평문 */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("암호화된 값 형식이 올바르지 않습니다.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** 화면에 표시할 마스킹 값 (앞 5자리만 노출, 나머지는 고정 길이로 마스킹) */
export function maskSecret(plainText: string): string {
  if (plainText.length <= 5) return "•".repeat(Math.max(plainText.length, 4));
  return `${plainText.slice(0, 5)}${"•".repeat(10)}`;
}
