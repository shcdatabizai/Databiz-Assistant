"""lib/crypto.ts의 AES-256-GCM 포맷("iv:authTag:ciphertext", 모두 base64)을 Python에서 복호화."""

from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _derive_key(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()


def decrypt_secret(payload: str, secret: str) -> str:
    iv_b64, tag_b64, data_b64 = payload.split(":")
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    data = base64.b64decode(data_b64)
    key = _derive_key(secret)
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, data + tag, None)
    return plaintext.decode("utf-8")
