"""lib/apiKeys.ts와 동일한 우선순위 로직으로 관리자/개인 API 키를 조회·복호화합니다.
Supabase REST API를 SUPABASE_SECRET_KEY로 직접 호출합니다 (Python 서버리스 함수용).
"""

from __future__ import annotations

import os
from typing import Optional

import requests

from .crypto import decrypt_secret

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""
ENCRYPTION_SECRET = os.environ.get("API_KEY_ENCRYPTION_SECRET") or ""


def _configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SECRET_KEY and ENCRYPTION_SECRET)


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _rest_get(path: str, params: dict) -> list:
    if not _configured():
        return []
    try:
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=_headers(), params=params, timeout=15)
        if resp.status_code >= 400:
            return []
        return resp.json() or []
    except requests.RequestException:
        return []


def resolve_api_key(key_name: str, user_id: Optional[str] = None) -> Optional[str]:
    """개인 키(use_admin_default=false) 우선, 없으면 관리자 기본 키. 둘 다 없으면 None."""
    if user_id:
        rows = _rest_get(
            "user_api_keys",
            {
                "select": "key_value_encrypted,use_admin_default",
                "user_id": f"eq.{user_id}",
                "key_name": f"eq.{key_name}",
                "limit": "1",
            },
        )
        if rows and not rows[0].get("use_admin_default"):
            try:
                return decrypt_secret(rows[0]["key_value_encrypted"], ENCRYPTION_SECRET)
            except Exception:
                return None

    rows = _rest_get(
        "admin_api_keys",
        {"select": "key_value_encrypted", "key_name": f"eq.{key_name}", "limit": "1"},
    )
    if rows:
        try:
            return decrypt_secret(rows[0]["key_value_encrypted"], ENCRYPTION_SECRET)
        except Exception:
            return None

    return None
