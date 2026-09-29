from http.server import BaseHTTPRequestHandler
import json
import os
import pathlib
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

# --- 경로 설정 ---
_BASE = pathlib.Path(__file__).parent.parent.parent / "data"
_ROOT = pathlib.Path(__file__).parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api._shared.keys import resolve_api_key  # noqa: E402

try:
    from api._shared.db import (  # noqa: E402
        get_recent_by_brno,
        insert_history,
        is_configured as db_configured,
        update_mapping as db_update_mapping,
    )
except Exception as _db_import_err:
    print(f"history db import failed: {_db_import_err}")

    def db_configured():
        return False

    def get_recent_by_brno(*_a, **_k):
        return None

    def insert_history(*_a, **_k):
        return None

    def db_update_mapping(*_a, **_k):
        return None


BIZNO_URL = "https://bizno.net/api/fapi"
GOV_URL = "https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3"

# 1차 LLM 결과가 이 코드들이면 Naver 검색으로 추가 정보 수집 후 재매핑
BROAD_MCT_CODES = {"261000", "214000", "444000", "781000", "442000", "451000", "452000"}

GOV_FIELD_LABELS = {
    "bzmnNm": "사업자명", "bzmnRgsSttusSeNm": "등록상태", "lctnAddr": "지번주소",
    "lctnRnAddr": "도로명주소", "dclrDate": "신고일자", "telno": "전화번호",
    "domncn": "도메인", "ntslMthdCn": "판매방식", "ntslPrdlstCn": "판매물품",
    "operSttusCdNm": "운영상태", "corpYnNm": "법인여부", "crno": "법인등록번호",
    "ctpvNm": "시도명", "rprsvEmladr": "대표이메일", "prcsDeptNm": "처리부서명",
    "prmmiYr": "허가개시년도", "lctnRnOzip": "우편번호",
    "opnSn": "개방일련번호", "opnSvcId": "개방서비스ID", "opnSvcNm": "개방서비스명",
    "opnDt": "개방일자", "trnmNm": "업종명", "dclrInstNm": "신고기관명",
    "dclrInstCd": "신고기관코드", "dclrDt": "신고일자", "sttusNm": "상태명",
    "sttusCd": "상태코드", "siteUrl": "사이트URL", "siteNm": "사이트명",
    "mnfctYn": "제조여부", "mnfctNm": "제조명",
}


def _load_categories():
    categories = {"mct_ry_cd": {}, "hpsn_mct_zcd": {}}
    try:
        with open(_BASE / "mct_ry_cd.json", encoding="utf-8") as f:
            mct_data = json.load(f)
        for code, info in mct_data.items():
            name = info.get("mct_ry_nm", "")
            if name and not name.startswith("기타"):
                categories["mct_ry_cd"][code] = name
    except Exception as e:
        print(f"mct_ry_cd.json 로딩 실패: {e}")

    try:
        with open(_BASE / "hpsn_mct_zcd.json", encoding="utf-8") as f:
            hpsn_data = json.load(f)
        for code, info in hpsn_data.items():
            name = info.get("hpsn_mct_zcd_nm", "")
            if name and not name.startswith("기타"):
                categories["hpsn_mct_zcd"][code] = name
    except Exception as e:
        print(f"hpsn_mct_zcd.json 로딩 실패: {e}")

    return categories


CATEGORIES = _load_categories()


# ============================================================
# bizno_scraper.py — inline
# ============================================================

BIZNO_BASE = "https://www.bizno.net"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _normalize_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _get_table_cell(soup: BeautifulSoup, label: str):
    for th in soup.find_all("th"):
        if th.get_text(strip=True) == label:
            return th.find_next_sibling("td")
    return None


def _parse_industry_classification(td) -> dict:
    if not td:
        return {}
    result = {}
    for paragraph in td.find_all("p"):
        text = paragraph.get_text(strip=True)
        if " : " in text:
            key, value = text.split(" : ", 1)
            result[key.strip()] = value.strip()
        elif text:
            result[f"항목{len(result) + 1}"] = text
    return result


def _parse_search_post(post) -> dict:
    link = post.select_one("a[href*='/article/']")
    titles = post.select_one(".titles")
    h4 = titles.select_one("h4") if titles else None
    h5_list = titles.select("h5") if titles else []
    address = post.select_one(".details p")

    representative = h5_list[0].get_text(strip=True) if len(h5_list) > 0 else ""
    industry_brief = h5_list[1].get_text(strip=True) if len(h5_list) > 1 else ""

    href = link.get("href", "") if link else ""
    article_path = href if href.startswith("/") else f"/{href.lstrip('/')}"

    return {
        "상호명": h4.get_text(strip=True) if h4 else "",
        "대표자명": representative,
        "업종(목록)": industry_brief,
        "주소": address.get_text(" ", strip=True) if address else "",
        "article_path": article_path,
        "article_url": urljoin(BIZNO_BASE, article_path),
    }


def _parse_detail_page(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    mail_order_td = _get_table_cell(soup, "통신판매업번호")
    industry_td = _get_table_cell(soup, "국세청산업분류")
    business_type_td = _get_table_cell(soup, "업 태")
    business_item_td = _get_table_cell(soup, "종 목")

    detail = {}

    if mail_order_td:
        value = mail_order_td.get_text(" ", strip=True)
        if value:
            detail["통신판매업번호"] = value

    industry = _parse_industry_classification(industry_td)
    if industry:
        detail["국세청산업분류"] = industry

    if business_type_td:
        value = business_type_td.get_text(" ", strip=True)
        if value:
            detail["업태"] = value

    if business_item_td:
        value = business_item_td.get_text(" ", strip=True)
        if value:
            detail["종목"] = value

    return detail


def _search_bizno(session: requests.Session, brno: str) -> dict:
    response = session.get(f"{BIZNO_BASE}/", params={"query": brno}, timeout=20)
    response.raise_for_status()
    response.encoding = "utf-8"

    soup = BeautifulSoup(response.text, "html.parser")
    posts = soup.select(".post-list .single-post")
    if not posts:
        return {"found": False, "items": []}

    items = [_parse_search_post(post) for post in posts]

    brno_digits = _normalize_digits(brno)
    matched = None
    for item in items:
        article_digits = _normalize_digits(item["article_path"])
        if article_digits == brno_digits or article_digits.endswith(brno_digits):
            matched = item
            break

    if matched is None and len(items) == 1:
        matched = items[0]

    return {"found": True, "items": items, "matched": matched}


def _fetch_detail(session: requests.Session, article_path: str) -> dict:
    url = urljoin(BIZNO_BASE, article_path)
    response = session.get(url, timeout=20)
    response.raise_for_status()
    response.encoding = "utf-8"
    return _parse_detail_page(response.text)


def crawl_bizno(brno: str) -> dict:
    session = _session()

    try:
        search_result = _search_bizno(session, brno)
    except requests.RequestException as exc:
        return {"success": False, "error": f"비즈노 검색 실패: {exc}"}

    if not search_result["found"]:
        return {"success": True, "found": False, "message": "비즈노 사이트에서 검색 결과가 없습니다."}

    matched = search_result.get("matched")
    if not matched:
        return {
            "success": True,
            "found": False,
            "multiple": True,
            "message": "검색 결과가 여러 건이나 사업자번호와 정확히 일치하는 항목이 없습니다.",
            "search_items": [
                {k: v for k, v in item.items() if k != "article_path"}
                for item in search_result["items"]
            ],
        }

    try:
        detail = _fetch_detail(session, matched["article_path"])
    except requests.RequestException as exc:
        return {"success": False, "error": f"비즈노 상세 페이지 조회 실패: {exc}"}

    search_preview = {k: v for k, v in matched.items() if k != "article_path"}

    if not detail:
        return {
            "success": True,
            "found": True,
            "search": search_preview,
            "detail": {},
            "message": "상세 페이지에서 업종 관련 정보를 찾지 못했습니다.",
        }

    return {"success": True, "found": True, "search": search_preview, "detail": detail}


# ============================================================
# API callers
# ============================================================

def query_bizno(brno: str, api_key: str | None) -> dict:
    if not api_key:
        return {"success": False, "error": "BIZNO_API_KEY가 등록되지 않았습니다. /admin/api-keys 에서 등록해주세요."}

    params = {
        "key": api_key, "gb": "1", "q": brno, "type": "json",
        "status": "N", "page": "1", "pagecnt": "10",
    }

    try:
        response = requests.get(BIZNO_URL, params=params, timeout=20)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        return {"success": False, "error": f"Bizno API 요청 실패: {exc}"}
    except ValueError:
        return {"success": False, "error": "Bizno API 응답을 JSON으로 파싱할 수 없습니다."}

    if data.get("resultCode") != 0:
        return {"success": False, "error": data.get("resultMsg", "Bizno API 오류"), "raw": data}

    items = [item for item in data.get("items", []) if item]
    if not items:
        return {"success": True, "found": False, "message": "검색 결과가 없습니다.", "raw": data}

    normalized = [
        {
            "상호명": item.get("company", ""),
            "사업자등록번호": item.get("bno", ""),
            "법인등록번호": item.get("cno", ""),
            "사업자상태": item.get("bstt", ""),
            "사업자상태코드": item.get("bsttcd", ""),
            "과세유형": item.get("taxtype", ""),
            "폐업일": item.get("EndDt", ""),
        }
        for item in items
    ]

    return {"success": True, "found": True, "total_count": data.get("totalCount", len(normalized)), "items": normalized, "raw": data}


def query_gov(brno: str, key_decoded: str | None, key_encoded: str | None) -> dict:
    if not key_decoded and not key_encoded:
        return {"success": False, "error": "공공데이터포털 API 키가 등록되지 않았습니다. /admin/api-keys 에서 등록해주세요."}

    params = {"pageNo": "1", "numOfRows": "100", "resultType": "json", "brno": brno}

    try:
        if key_decoded:
            params["serviceKey"] = key_decoded
            response = requests.get(GOV_URL, params=params, timeout=20)
        else:
            from urllib.parse import urlencode
            query = urlencode(params)
            url = f"{GOV_URL}?serviceKey={key_encoded}&{query}"
            response = requests.get(url, timeout=20)
        if response.status_code == 403:
            return {
                "success": False,
                "error": "공공데이터 API 접근 거부(403). 해당 API 활용신청 여부와 인증키를 확인해 주세요.",
                "status_code": 403,
            }
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        return {"success": False, "error": f"공공데이터 API 요청 실패: {exc}"}
    except ValueError:
        return {"success": False, "error": "공공데이터 API 응답을 JSON으로 파싱할 수 없습니다."}

    if "response" in data:
        body = data.get("response", {}).get("body", {})
        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode", "")
        result_msg = header.get("resultMsg", "")
        total_count = body.get("totalCount", 0)
        raw_items = body.get("items")
    else:
        result_code = data.get("resultCode", "")
        result_msg = data.get("resultMsg", "")
        total_count = data.get("totalCount", 0)
        raw_items = data.get("items")

    if result_code and result_code not in ("00", "0"):
        return {"success": False, "error": result_msg or "공공데이터 API 오류", "result_code": result_code, "raw": data}

    if not raw_items:
        return {"success": True, "found": False, "message": "통신판매사업자 등록 정보가 없습니다.", "total_count": total_count, "raw": data}

    if isinstance(raw_items, dict):
        raw_items = [raw_items]

    items = []
    for item in raw_items:
        labeled = {}
        for key, value in item.items():
            if value in (None, ""):
                continue
            label = GOV_FIELD_LABELS.get(key, key)
            labeled[label] = value
        items.append(labeled)

    return {"success": True, "found": True, "total_count": total_count or len(items), "items": items, "raw": data}


def query_ftc(brno: str) -> dict:
    """FTC 가맹사업 정보 — 서버리스 환경에서는 미지원"""
    return {"success": True, "found": False, "message": "가맹사업 조회는 지원되지 않습니다."}


def extract_company_name(bizno_result, crawl_result, gov_result) -> str:
    if bizno_result and bizno_result.get("success") and bizno_result.get("items"):
        try:
            items = bizno_result.get("items", [])
            if items and isinstance(items, list):
                return items[0].get("상호명", "")
        except (KeyError, IndexError, TypeError):
            pass

    if crawl_result and crawl_result.get("success") and crawl_result.get("search"):
        try:
            return crawl_result.get("search", {}).get("상호명", "")
        except (KeyError, TypeError):
            pass

    if gov_result and gov_result.get("success") and gov_result.get("items"):
        try:
            items = gov_result.get("items", [])
            if items and isinstance(items, list):
                return items[0].get("법인명", "")
        except (KeyError, IndexError, TypeError):
            pass

    return ""


# ============================================================
# LLM mapping
# ============================================================

def search_naver_business(company_name: str, client_id: str | None, client_secret: str | None) -> str:
    if not client_id or not client_secret:
        return ""
    try:
        local_res = requests.get(
            "https://openapi.naver.com/v1/search/local.json",
            params={"query": company_name, "display": 3},
            headers={"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": client_secret},
            timeout=10,
        )
        local_items = []
        if local_res.ok:
            for item in local_res.json().get("items", []):
                title = re.sub(r"<[^>]+>", "", item.get("title", ""))
                category = item.get("category", "")
                addr = item.get("roadAddress") or item.get("address", "")
                local_items.append(f"{title} / 업종:{category} / 주소:{addr}")

        web_res = requests.get(
            "https://openapi.naver.com/v1/search/webkr.json",
            params={"query": f"{company_name} 사업 서비스", "display": 3},
            headers={"X-Naver-Client-Id": client_id, "X-Naver-Client-Secret": client_secret},
            timeout=10,
        )
        web_snippets = []
        if web_res.ok:
            for item in web_res.json().get("items", []):
                desc = re.sub(r"<[^>]+>", "", item.get("description", ""))
                if desc:
                    web_snippets.append(desc[:120])

        parts = []
        if local_items:
            parts.append("【네이버 업체검색】\n" + "\n".join(local_items))
        if web_snippets:
            parts.append("【네이버 웹검색 요약】\n" + "\n".join(web_snippets))
        return "\n\n".join(parts)
    except Exception as e:
        print(f"Naver 검색 실패: {e}")
        return ""


def _build_mapping_prompt(table_data: str, extra_context: str = "") -> str:
    mct_codes = ", ".join([f"{code}({name})" for code, name in CATEGORIES["mct_ry_cd"].items()])
    hpsn_codes = ", ".join([f"{code}({name})" for code, name in CATEGORIES["hpsn_mct_zcd"].items()])

    if extra_context:
        priority_block = """**판단 우선순위 (Naver 추가검색 결과 있음)**:
1. 아래 [추가 검색 정보]에서 확인된 실제 취급 품목/서비스 — 최우선 반영
2. 통신판매 판매물품, 가맹사업 주요상품
3. 국세청산업분류 소분류/세분류
4. 업태/종목 — '전자상거래', '도매및소매' 등 유통 방식에 해당하면 실제 품목이 확인된 경우 무시
5. 상호명은 마지막 수단으로만 참고 (상호명만으로 업종 추론 금지)

**핵심 원칙**: '전자상거래', '무점포소매', '도매및소매' 등은 판매 방식이지 업종이 아님. 실제 취급 품목(캔들, 의류, 식품 등)이 확인되면 그 품목의 업종으로 매핑하세요."""
        context_block = f"\n[추가 검색 정보 — 실제 취급 품목/서비스 파악에 활용하세요]\n{extra_context}\n"
    else:
        priority_block = """**판단 우선순위 (사업자 등록 정보 기반)**:
1. 통신판매 판매물품, 가맹사업 주요상품 — 실제 취급 품목이 명시된 경우 최우선
2. 업태/종목 — 사업자등록증 기재 정보. 단, '전자상거래', '무점포소매', '도매및소매'처럼 유통 방식만 나타내는 경우 3번 이하 정보와 함께 종합 판단
3. 국세청산업분류 소분류/세분류 — 구체적 업종 확인
4. 상호명은 마지막 수단으로만 참고 (상호명만으로 업종 추론 금지)"""
        context_block = ""

    return f"""다음 사업 정보를 분석하여 최적의 가맹점업종 코드를 매핑하세요.
무조건 1개씩 선택해야 합니다. NULL값이나 빈 값은 허용되지 않습니다.

[사업 정보]
{table_data}
{context_block}
[가맹점업종기준 코드 (mct_ry_cd) - 전체 {len(CATEGORIES['mct_ry_cd'])}개]
{mct_codes}

[초개인화업종기준 코드 (hpsn_mct_zcd) - 전체 {len(CATEGORIES['hpsn_mct_zcd'])}개]
{hpsn_codes}

위의 사업 정보를 바탕으로 최적의 업종을 매핑하세요.

{priority_block}

**중요**: 반드시 아래 규칙을 따르세요:
1. mct_ry_cd와 hpsn_mct_zcd 모두 정확히 1개씩만 선택하세요
2. 완전히 확실하지 않으면 가장 가능성 높은 것을 선택하세요
3. null, 빈 값, 미지정은 허용되지 않습니다
4. 선택할 수 없으면 일반적인 업종을 선택하세요

응답 형식 (JSON):
{{
  "mct_ry_cd": {{"code": "CODE", "name": "업종명"}},
  "hpsn_mct_zcd": {{"code": "CODE", "name": "업종명"}},
  "reasoning": "매핑 이유 (추가 검색 정보를 활용한 경우 그 근거 포함)"
}}

주의:
- 반드시 위의 코드 목록에서만 선택하세요
- code는 숫자 또는 영문+숫자 형식 그대로 입력하세요
- JSON 형식을 정확히 지키세요"""


def _parse_llm_json(result_text: str) -> dict:
    if "```json" in result_text:
        result_text = result_text.split("```json")[1].split("```")[0].strip()
    elif "```" in result_text:
        result_text = result_text.split("```")[1].split("```")[0].strip()
    return json.loads(result_text)


def _validate_mapping(mapping_result: dict) -> dict:
    if mapping_result.get("mct_ry_cd"):
        code = mapping_result["mct_ry_cd"].get("code")
        if code and code not in CATEGORIES["mct_ry_cd"]:
            mapping_result["mct_ry_cd"]["name"] = CATEGORIES["mct_ry_cd"].get(code, mapping_result["mct_ry_cd"].get("name", ""))
    if mapping_result.get("hpsn_mct_zcd"):
        code = mapping_result["hpsn_mct_zcd"].get("code")
        if code and code not in CATEGORIES["hpsn_mct_zcd"]:
            mapping_result["hpsn_mct_zcd"]["name"] = CATEGORIES["hpsn_mct_zcd"].get(code, mapping_result["hpsn_mct_zcd"].get("name", ""))
    return mapping_result


# 무료/일반 티어는 모델별로 별도 쿼터를 가지므로, 한 모델이 한도초과(429)/일시과부하(5xx)면
# 다음 모델로 자동 전환해서 재시도한다. 앞쪽일수록 우선 시도. 실제 1차 모델(GEMINI_MODEL)은 맨 앞에 추가됨.
# (Diet Buddy 프로젝트의 src/lib/coach.server.ts `withModelFallback` 로직을 Python으로 포팅)
GEMINI_MODEL_FALLBACKS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-flash-latest",
]

# 같은 모델에서 429/5xx를 만났을 때 다음 모델로 넘어가기 전에, 짧게 재시도할 간격(초).
_SAME_MODEL_RETRY_DELAYS_SEC = [0, 0.9, 1.8]

# 하드코딩된 목록이 전부 실패했을 때만(최후의 수단으로) 실제 사용 가능한 모델 목록을 조회한다.
# 매 요청마다 조회하면 느려지므로, 실패 시에만 조회하고 잠시 캐시해서 같은 장애 상황에서 반복 조회하지 않는다.
_LIVE_MODELS_TTL_SEC = 600
_live_models_cache: dict[str, tuple[float, list]] = {}
_EXCLUDE_MODEL_RE = re.compile(r"embedding|aqa|tts|image-generation|imagen|veo|learnlm|gemma", re.IGNORECASE)


class _AiRateLimitError(Exception):
    """429 한도초과 — 같은 모델 짧게 재시도 후, 그래도 안 되면 다음 모델로."""


class _AiTransientError(Exception):
    """500/502/503/504 등 일시적 과부하/타임아웃 — 같은 모델 짧게 재시도 후, 그래도 안 되면 다음 모델로."""


class _AiModelUnavailableError(Exception):
    """404(모델 없음)/403(이 키로 이 모델 사용불가)/빈 응답 — 재시도 없이 즉시 다음 모델로."""


def _classify_gemini_error(err: Exception) -> Exception | None:
    """오류를 fallback 트리거 타입으로 재분류. None이면 fallback 대상이 아님(예: 키 자체가 잘못됨 → 즉시 실패)."""
    try:
        from google.api_core import exceptions as gexc
    except Exception:  # google-api-core 미설치 등 — 문자열 매칭으로만 판단
        gexc = None

    if gexc is not None:
        if isinstance(err, gexc.ResourceExhausted):
            return _AiRateLimitError(str(err))
        if isinstance(err, (gexc.ServiceUnavailable, gexc.InternalServerError, gexc.DeadlineExceeded)):
            return _AiTransientError(str(err))
        # 403은 키 자체가 아니라 "이 모델은 이 키/티어에서 못 씀"인 경우가 많아서 다음 모델로 넘어간다.
        if isinstance(err, (gexc.NotFound, gexc.PermissionDenied, gexc.InvalidArgument)):
            return _AiModelUnavailableError(str(err))
        if isinstance(err, gexc.Unauthenticated):
            return None

    # SDK가 위 타입으로 감싸지 않는 경우를 대비해 오류 문구로도 폭넓게 매칭
    text = str(err).lower()
    if any(s in text for s in ("429", "quota", "rate limit", "resource_exhausted")):
        return _AiRateLimitError(str(err))
    if any(
        s in text
        for s in ("500", "502", "503", "504", "deadline", "timeout", "timed out", "unavailable", "overloaded", "internal error")
    ):
        return _AiTransientError(str(err))
    if any(s in text for s in ("404", "403", "not found", "permission")):
        return _AiModelUnavailableError(str(err))
    return None


def _fetch_live_gemini_models(genai_module) -> list:
    """하드코딩 목록이 전부 실패했을 때만 최후 수단으로 실제 사용 가능한 모델 목록을 조회 (10분 캐시)."""
    now = time.time()
    cached = _live_models_cache.get("text")
    if cached and now - cached[0] < _LIVE_MODELS_TTL_SEC:
        return cached[1]
    try:
        models = []
        for m in genai_module.list_models():
            name = (getattr(m, "name", "") or "").replace("models/", "")
            methods = getattr(m, "supported_generation_methods", []) or []
            if "generateContent" not in methods:
                continue
            if not name.startswith("gemini") or _EXCLUDE_MODEL_RE.search(name):
                continue
            models.append(name)
        # flash 계열을 우선, 그 안에서는 최신 이름을 우선 시도.
        models.sort(reverse=True)
        models.sort(key=lambda n: 0 if "flash" in n else 1)
        _live_models_cache["text"] = (now, models)
        return models
    except Exception as e:  # noqa: BLE001
        print(f"[Gemini] 실시간 모델 목록 조회 실패: {e}")
        return cached[1] if cached else []


def _gemini_generate_with_fallback(genai_module, primary_model: str, prompt: str):
    """1순위 모델부터 시도하다가 한도초과(429)/일시과부하(5xx)/미지원 모델(404/403)이면 다음 모델로 자동 전환한다.
    하드코딩 목록이 전부 실패하면 실제 사용 가능한 모델 목록을 조회해 한 번 더 시도한다.
    반환값: (response, 실제로 성공한 모델명)
    """
    tried: set = set()
    last_err: Exception | None = None

    def attempt_with_retry(model_name: str):
        nonlocal last_err
        for i, wait in enumerate(_SAME_MODEL_RETRY_DELAYS_SEC):
            if wait:
                time.sleep(wait)
            try:
                model = genai_module.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                if not (getattr(response, "text", "") or "").strip():
                    raise _AiModelUnavailableError(f"{model_name} 이 빈 응답을 반환했습니다.")
                return response
            except Exception as e:  # noqa: BLE001
                classified = e if isinstance(e, (_AiRateLimitError, _AiTransientError, _AiModelUnavailableError)) else _classify_gemini_error(e)
                if classified is None:
                    raise e
                last_err = classified
                retryable_same_model = isinstance(classified, (_AiRateLimitError, _AiTransientError))
                if not retryable_same_model or i >= len(_SAME_MODEL_RETRY_DELAYS_SEC) - 1:
                    raise classified
                print(f"[Gemini retry] {model_name} 일시 실패, {_SAME_MODEL_RETRY_DELAYS_SEC[i + 1]}초 후 재시도: {classified}")
        raise last_err  # pragma: no cover - 위 루프는 항상 return/raise로 종료됨

    def try_models(model_names):
        nonlocal last_err
        for model_name in model_names:
            if model_name in tried:
                continue
            tried.add(model_name)
            try:
                response = attempt_with_retry(model_name)
                if model_name != primary_model:
                    print(f"[Gemini fallback] {primary_model} 등 실패 → {model_name} 로 성공")
                return response, model_name
            except Exception as e:  # noqa: BLE001
                last_err = e
                print(f"[Gemini fallback] {model_name} 실패, 다음 모델로 전환: {e}")
                continue
        return None

    candidates = [primary_model] + [m for m in GEMINI_MODEL_FALLBACKS if m != primary_model]
    result = try_models(candidates)
    if result:
        return result

    live_models = _fetch_live_gemini_models(genai_module)
    result = try_models(live_models)
    if result:
        return result

    raise last_err if last_err else RuntimeError("지금 사용 가능한 Gemini 모델이 모두 한도를 초과했거나 사용할 수 없습니다.")


def perform_category_mapping(
    brno: str, company_name: str, bizno_result: dict, crawl_result: dict,
    gov_result: dict, ftc_result: dict, gemini_api_key: str | None,
    gemini_model: str, naver_client_id: str | None, naver_client_secret: str | None,
) -> dict:
    """Gemini API를 사용하여 업종 매핑 수행. 광범위 업종이면 Naver 검색 후 재매핑."""
    if not company_name or not gemini_api_key:
        return {}

    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini_api_key)

        crawl_detail = crawl_result.get("detail", {}) if crawl_result else {}
        industry_category = (
            crawl_detail.get("국세청산업분류", {}) if isinstance(crawl_detail.get("국세청산업분류"), dict) else {}
        )
        biz_type = crawl_detail.get("업태", "")
        biz_item = crawl_detail.get("종목", "")
        gov_items = gov_result.get("items", []) if gov_result else []
        gov_info = gov_items[0] if gov_items else {}
        ftc_items = ftc_result.get("브랜드", []) if ftc_result else []
        ftc_info = ftc_items[0] if ftc_items else {}

        table_data = (
            f"사업자번호|상호명|업태|종목|국세청산업분류_대분류|중분류|소분류|세분류|세세분류|"
            f"통신판매업_판매물품|가맹사업_산업대분류|중분류|소분류|주요상품값\n"
            f"{brno}|{company_name}"
            f"|{biz_type}|{biz_item}"
            f"|{industry_category.get('대분류', '')}|{industry_category.get('중분류', '')}"
            f"|{industry_category.get('소분류', '')}|{industry_category.get('세분류', '')}"
            f"|{industry_category.get('세세분류', '')}|{gov_info.get('판매물품', '')}"
            f"|{ftc_info.get('산업대분류', '')}|{ftc_info.get('산업중분류', '')}"
            f"|{ftc_info.get('주요상품', '')}|"
        )

        prompt = _build_mapping_prompt(table_data)
        print(f"[매핑 1차] {brno} - {company_name}")
        response, used_model = _gemini_generate_with_fallback(genai, gemini_model, prompt)
        mapping_result = _validate_mapping(_parse_llm_json(response.text.strip()))
        print(f"[매핑 1차 결과] (model={used_model}) {mapping_result}")

        mct_code = mapping_result.get("mct_ry_cd", {}).get("code", "")
        if mct_code in BROAD_MCT_CODES:
            print(f"[매핑] 광범위 업종({mct_code}) 감지 → Naver 검색으로 재매핑 시도")
            naver_context = search_naver_business(company_name, naver_client_id, naver_client_secret)
            if naver_context:
                prompt2 = _build_mapping_prompt(table_data, extra_context=naver_context)
                response2, used_model2 = _gemini_generate_with_fallback(genai, used_model, prompt2)
                mapping_result2 = _validate_mapping(_parse_llm_json(response2.text.strip()))
                reasoning2 = mapping_result2.get("reasoning", "")
                mapping_result2["reasoning"] = f"[Naver 추가검색 후 재매핑] {reasoning2}"
                print(f"[매핑 2차 결과] (model={used_model2}) {mapping_result2}")
                mapping_result = mapping_result2
            else:
                print("[매핑] Naver 검색 결과 없음, 1차 결과 유지")

        return mapping_result

    except json.JSONDecodeError as e:
        print(f"JSON 파싱 실패: {e}")
        return {}
    except Exception as e:
        print(f"업종매핑 실패: {e}")
        import traceback
        traceback.print_exc()
        return {}


# ============================================================
# Vercel handler
# ============================================================

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
        except Exception:
            self._respond(400, {"error": "Invalid JSON body"})
            return

        brno = body.get("brno", "").replace("-", "").strip()
        brno = re.sub(r"\D", "", brno)

        if len(brno) != 10:
            self._respond(400, {"error": "사업자번호는 10자리 숫자여야 합니다."})
            return

        perform_mapping = body.get("perform_category_mapping", False)
        user_id = body.get("user_id")

        record_id = None
        is_cached = False
        cached = None
        brno_formatted = f"{brno[:3]}-{brno[3:5]}-{brno[5:]}"
        query_date = datetime.now(timezone.utc).isoformat()

        if db_configured():
            try:
                cached = get_recent_by_brno(brno)
            except Exception as e:
                print(f"DB 조회 실패 (캐시): {e}")
                cached = None

        if cached:
            is_cached = True
            record_id = cached.get("id")
            bizno_result = (cached.get("api") or {}).get("bizno")
            gov_result = (cached.get("api") or {}).get("gov")
            crawl_result = cached.get("crawl")
            ftc_result = cached.get("ftc")
            company_name = cached.get("company_name")
            query_date = cached.get("query_date") or query_date
        else:
            bizno_api_key = resolve_api_key("BIZNO_API_KEY", user_id)
            gov_key_decoded = resolve_api_key("GOV_API_KEY_DECODED", user_id)
            gov_key_encoded = resolve_api_key("GOV_API_KEY_ENCODED", user_id)

            bizno_result = query_bizno(brno, bizno_api_key)
            gov_result = query_gov(brno, gov_key_decoded, gov_key_encoded)
            crawl_result = crawl_bizno(brno)
            ftc_result = query_ftc(brno)
            company_name = extract_company_name(bizno_result, crawl_result, gov_result)

            if db_configured():
                try:
                    inserted = insert_history(
                        brno=brno,
                        brno_formatted=brno_formatted,
                        company_name=company_name,
                        query_date=query_date,
                        bizno_result=bizno_result,
                        gov_result=gov_result,
                        crawl_result=crawl_result,
                        ftc_result=ftc_result,
                        queried_by=user_id,
                    )
                    if inserted:
                        record_id = inserted.get("id")
                except Exception as e:
                    print(f"DB 저장 실패: {e}")

        result = {
            "id": record_id,
            "brno": brno,
            "brno_formatted": brno_formatted,
            "company_name": company_name,
            "query_date": query_date,
            "is_cached": is_cached,
            "api": {"bizno": bizno_result, "gov": gov_result},
            "crawl": crawl_result,
            "ftc": ftc_result,
        }

        if perform_mapping and company_name:
            gemini_api_key = resolve_api_key("GEMINI_API_KEY", user_id)
            gemini_model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
            naver_client_id = resolve_api_key("NAVER_CLIENT_ID", user_id)
            naver_client_secret = resolve_api_key("NAVER_CLIENT_SECRET", user_id)
            mapping = perform_category_mapping(
                brno, company_name, bizno_result, crawl_result, gov_result, ftc_result,
                gemini_api_key, gemini_model, naver_client_id, naver_client_secret,
            )
            if mapping:
                result["mapping"] = mapping
                if db_configured() and record_id:
                    try:
                        db_update_mapping(
                            record_id,
                            mct_ry_cd=mapping.get("mct_ry_cd"),
                            hpsn_mct_zcd=mapping.get("hpsn_mct_zcd"),
                            reasoning=mapping.get("reasoning", ""),
                        )
                    except Exception as e:
                        print(f"매핑 결과 저장 실패: {e}")
        elif is_cached and cached and cached.get("mapping"):
            result["mapping"] = cached.get("mapping")

        self._respond(200, result)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _respond(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
