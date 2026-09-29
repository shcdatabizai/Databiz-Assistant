"""Google Drive parquet을 report_agent_v2 대시보드 집계로 돌려 Supabase에 저장합니다.

GitHub Actions(dashboard_build.yml)에서 실행합니다.
환경변수: YEAR_MONTH, DRIVE_FILE_ID,
          NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, API_KEY_ENCRYPTION_SECRET
서비스 계정 JSON은 admin_api_keys의 GOOGLE_SERVICE_ACCOUNT_JSON에서 읽습니다.
"""

from __future__ import annotations

import base64
import json
import os
import pathlib
import sys
import tempfile
import time
import traceback

import requests

_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api._shared.keys import resolve_api_key  # noqa: E402

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _drive_token(sa: dict) -> str:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    now = int(time.time())
    header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claim = _b64url(
        json.dumps(
            {
                "iss": sa["client_email"],
                "scope": "https://www.googleapis.com/auth/drive.readonly",
                "aud": "https://oauth2.googleapis.com/token",
                "iat": now,
                "exp": now + 3600,
            }
        ).encode()
    )
    key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
    sig = key.sign(f"{header}.{claim}".encode(), padding.PKCS1v15(), hashes.SHA256())
    jwt = f"{header}.{claim}.{_b64url(sig)}"
    res = requests.post(
        "https://oauth2.googleapis.com/token",
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt},
        timeout=30,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def download_drive_file(file_id: str, dest: str, sa: dict) -> None:
    token = _drive_token(sa)
    with requests.get(
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        params={"alt": "media", "supportsAllDrives": "true"},
        headers={"Authorization": f"Bearer {token}"},
        stream=True,
        timeout=600,
    ) as res:
        if res.status_code >= 400:
            raise RuntimeError(f"Drive 다운로드 실패 {res.status_code}: {res.text[:300]}")
        with open(dest, "wb") as f:
            for chunk in res.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)


def patch_upload(year_month: str, body: dict) -> None:
    res = requests.patch(
        f"{SUPABASE_URL}/rest/v1/dashboard_monthly_uploads",
        headers={**_headers(), "Prefer": "return=minimal"},
        params={"year_month": f"eq.{year_month}"},
        json=body,
        timeout=30,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"업로드 상태 저장 실패 {res.status_code}: {res.text[:300]}")


def save_metrics(year_month: str, payload: dict, row_count: int) -> None:
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/dashboard_monthly_metrics",
        headers={**_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "year_month"},
        json={
            "year_month": year_month,
            "payload": payload,
            "row_count": row_count,
            "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        timeout=60,
    )
    if res.status_code >= 400:
        raise RuntimeError(f"집계 저장 실패 {res.status_code}: {res.text[:500]}")


def _num(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    if number != number:
        return None
    return int(number) if number.is_integer() else round(number, 2)


def _series(labels, current, prev, yoy=None):
    rows = []
    labels = labels or []
    current = current or []
    prev = prev or []
    yoy = yoy or []
    for i, label in enumerate(labels):
        row = {
            "구분": str(label),
            "당월(억원)": _num(current[i]) if i < len(current) else None,
            "전년(억원)": _num(prev[i]) if i < len(prev) else None,
        }
        if i < len(yoy):
            row["전년비(%)"] = _num(yoy[i])
        rows.append(row)
    return rows


def ui_payload(report: dict) -> dict:
    dash = report["dashboard"]
    kpi = dash["kpi"]
    industries = []
    for row in dash.get("tbl") or []:
        industries.append(
            {
                "업종": row.get("ry_nm"),
                "거래금액(억원)": row.get("est_amt"),
                "전년(억원)": row.get("est_amt_bf"),
                "금액 전년비(%)": row.get("yoy_amt_pct"),
                "건수 전년비(%)": row.get("yoy_cnt_pct"),
                "건당금액(원)": row.get("atv"),
                "전년 건당금액(원)": row.get("atv_bf"),
                "건당금액 전년비(%)": row.get("yoy_atv_pct"),
            }
        )
    flows = []
    for row in dash.get("cty_flow") or []:
        flows.append(
            {
                "지역": row.get("cty_nm"),
                "유입": row.get("dist_type"),
                "거래금액(억원)": row.get("amt_ukw"),
                "전년(억원)": row.get("amt_bf_ukw"),
                "전년비(%)": row.get("yoy_amt_pct"),
            }
        )
    ry = dash.get("ry") or {}
    cty = dash.get("cty") or {}
    wdn = dash.get("wdn") or {}
    tm = dash.get("tm") or {}
    age = dash.get("age") or {}
    meta = report.get("meta") or {}
    return {
        "기준": {
            "기준월": f"{meta.get('target_year')}-{int(meta.get('target_month') or 0):02d}",
            "비교월": f"{meta.get('prev_year')}-{int(meta.get('prev_month') or 0):02d}",
        },
        "요약": {
            "추정 총 거래금액(억원)": kpi.get("total_amt"),
            "전년 동기 거래금액(억원)": kpi.get("total_amt_bf"),
            "거래금액 전년비(%)": kpi.get("yoy_amt"),
            "추정 총 거래건수(만건)": kpi.get("total_cnt"),
            "전년 동기 거래건수(만건)": kpi.get("total_cnt_bf"),
            "거래건수 전년비(%)": kpi.get("yoy_cnt"),
        },
        "업종": industries,
        "지역": _series(cty.get("amt_labels"), cty.get("amt_current"), cty.get("amt_prev"), cty.get("yoy_vals")),
        "주차별": _series(wdn.get("cur_labels"), wdn.get("current"), wdn.get("prev"), wdn.get("yoy")),
        "시간대": _series(tm.get("labels"), tm.get("current"), tm.get("prev")),
        "연령": _series(age.get("labels10"), age.get("current10"), age.get("prev10"), age.get("yoy10")),
        "지역 유입": flows,
        "업종 상위": _series(ry.get("amt_labels"), ry.get("amt_current"), ry.get("amt_prev"), ry.get("yoy_vals")),
        "_dashboard": dash,
    }


def main() -> None:
    year_month = (os.environ.get("YEAR_MONTH") or "").strip()
    file_id = (os.environ.get("DRIVE_FILE_ID") or "").strip()
    if not (len(year_month) == 6 and year_month.isdigit()):
        raise SystemExit("YEAR_MONTH는 YYYYMM 6자리여야 합니다.")
    if not file_id:
        raise SystemExit("DRIVE_FILE_ID가 없습니다.")
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise SystemExit("Supabase 환경변수가 없습니다.")

    raw = resolve_api_key("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise SystemExit("GOOGLE_SERVICE_ACCOUNT_JSON이 등록되지 않았습니다.")
    sa = json.loads(raw)
    if not sa.get("client_email") or not sa.get("private_key"):
        raise SystemExit("서비스 계정 JSON에 client_email 또는 private_key가 없습니다.")

    patch_upload(year_month, {"status": "processing", "error_message": None})
    fd, path = tempfile.mkstemp(suffix=".parquet")
    os.close(fd)
    try:
        print(f"Drive 파일 다운로드: {file_id}")
        download_drive_file(file_id, path, sa)
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"다운로드 완료: {size_mb:.1f}MB")

        import pyarrow.parquet as pq

        row_count = int(pq.ParquetFile(path).metadata.num_rows)
        print(f"원본 행 수: {row_count:,}")

        os.environ["DG_YM"] = year_month
        os.environ["DG_SOURCE_FILE"] = path
        dash_root = pathlib.Path(__file__).parent / "report_dashboard"
        sys.path.insert(0, str(dash_root))
        from pipelines.extract_metrics import build_report_payload  # noqa: E402

        report = build_report_payload()
        payload = ui_payload(report)
        save_metrics(year_month, payload, row_count)
        patch_upload(year_month, {"status": "done", "error_message": None})
        kpi = report["dashboard"]["kpi"]
        print(
            f"집계 완료 {year_month}: 거래금액 {kpi.get('total_amt')}억원, "
            f"전년비 {kpi.get('yoy_amt')}%"
        )
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


if __name__ == "__main__":
    ym = (os.environ.get("YEAR_MONTH") or "").strip()
    try:
        main()
    except Exception as exc:
        message = f"{exc}".replace("\n", " ")[:500]
        print(traceback.format_exc())
        if ym and SUPABASE_URL and SUPABASE_SECRET_KEY:
            try:
                patch_upload(ym, {"status": "error", "error_message": message})
            except Exception as patch_exc:
                print(f"상태 저장 실패: {patch_exc}")
        raise SystemExit(1) from exc
