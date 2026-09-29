"""Supabase REST 헬퍼: biz_query_history (기능1 사업자번호 조회 이력/캐시).
biz_reg_no_app/py_lib/history_db.py를 새 스키마(biz_query_history, queried_by)에 맞게 이식.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""

_TIMEOUT = 20


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _headers(prefer: Optional[str] = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _rest(path: str) -> str:
    return f"{SUPABASE_URL}/rest/v1/{path}"


def _request(method: str, path: str, *, params=None, json=None, prefer: Optional[str] = None):
    if not is_configured():
        raise RuntimeError("Supabase가 설정되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY를 확인하세요.")
    resp = requests.request(
        method,
        _rest(path),
        headers=_headers(prefer),
        params=params,
        json=json,
        timeout=_TIMEOUT,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase {resp.status_code}: {resp.text[:500]}")
    if not resp.content:
        return []
    return resp.json()


def row_to_record(row: dict) -> dict:
    mapping = None
    if row.get("mct_ry_cd_result") is not None or row.get("hpsn_mct_zcd_result") is not None:
        mapping = {
            "mct_ry_cd": row.get("mct_ry_cd_result"),
            "hpsn_mct_zcd": row.get("hpsn_mct_zcd_result"),
        }
    if row.get("mapping_reasoning") is not None:
        if mapping is None:
            mapping = {}
        mapping["reasoning"] = row.get("mapping_reasoning")

    result = {
        "id": row.get("id"),
        "brno": row.get("brno"),
        "brno_formatted": row.get("brno_formatted"),
        "company_name": row.get("company_name"),
        "query_date": row.get("query_date"),
        "api": {
            "bizno": row.get("bizno_result"),
            "gov": row.get("gov_result"),
        },
        "crawl": row.get("crawl_result"),
        "ftc": row.get("ftc_result"),
    }
    if mapping:
        result["mapping"] = mapping
    return result


def get_recent_by_brno(brno: str, days: int = 90) -> Optional[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = _request(
        "GET",
        "biz_query_history",
        params={
            "select": "*",
            "brno": f"eq.{brno}",
            "query_date": f"gte.{cutoff.isoformat()}",
            "order": "query_date.desc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    return row_to_record(rows[0])


def insert_history(
    *,
    brno: str,
    brno_formatted: str,
    company_name: Optional[str],
    query_date: str,
    bizno_result: Any,
    gov_result: Any,
    crawl_result: Any,
    ftc_result: Any,
    mct_ry_cd_result: Any = None,
    hpsn_mct_zcd_result: Any = None,
    mapping_reasoning: Optional[str] = None,
    queried_by: Optional[str] = None,
) -> Optional[dict]:
    payload: dict[str, Any] = {
        "brno": brno,
        "brno_formatted": brno_formatted,
        "company_name": company_name,
        "query_date": query_date,
        "bizno_result": bizno_result,
        "gov_result": gov_result,
        "crawl_result": crawl_result,
        "ftc_result": ftc_result,
        "mct_ry_cd_result": mct_ry_cd_result,
        "hpsn_mct_zcd_result": hpsn_mct_zcd_result,
        "mapping_reasoning": mapping_reasoning,
    }
    if queried_by:
        payload["queried_by"] = queried_by
    rows = _request("POST", "biz_query_history", json=payload, prefer="return=representation")
    if not rows:
        return None
    return row_to_record(rows[0] if isinstance(rows, list) else rows)


def update_mapping(
    record_id: int,
    *,
    mct_ry_cd=None,
    hpsn_mct_zcd=None,
    reasoning: Optional[str] = None,
) -> Optional[dict]:
    payload: dict[str, Any] = {}
    if mct_ry_cd is not None:
        payload["mct_ry_cd_result"] = mct_ry_cd
    if hpsn_mct_zcd is not None:
        payload["hpsn_mct_zcd_result"] = hpsn_mct_zcd
    if reasoning is not None:
        payload["mapping_reasoning"] = reasoning
    if not payload:
        return None
    rows = _request(
        "PATCH",
        "biz_query_history",
        params={"id": f"eq.{record_id}"},
        json=payload,
        prefer="return=representation",
    )
    if not rows:
        return None
    return row_to_record(rows[0] if isinstance(rows, list) else rows)


def list_history() -> list[dict]:
    rows = _request("GET", "biz_query_history", params={"select": "*", "order": "query_date.desc"})
    return [row_to_record(r) for r in (rows or [])]


def delete_record(record_id: int) -> bool:
    _request(
        "DELETE",
        "biz_query_history",
        params={"id": f"eq.{record_id}"},
        prefer="return=minimal",
    )
    return True


def delete_records(record_ids: list[int]) -> int:
    if not record_ids:
        return 0
    ids = ",".join(str(int(i)) for i in record_ids)
    rows = _request(
        "DELETE",
        "biz_query_history",
        params={"id": f"in.({ids})"},
        prefer="return=representation",
    )
    return len(rows or [])


def delete_old_records(days: int = 90) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = _request(
        "DELETE",
        "biz_query_history",
        params={"query_date": f"lt.{cutoff.isoformat()}"},
        prefer="return=representation",
    )
    return len(rows or [])
