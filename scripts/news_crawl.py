"""
데이터뉴스 수집 파이프라인 (SH_datanew_crawling 이식, Supabase 저장).

SH_datanew_crawling과 달리 결과를 JSON 파일이 아닌 Supabase
(news_weeks / news_articles 테이블)에 저장합니다.

실행 방식:
  - GitHub Actions 주간 cron (.github/workflows/weekly_news_crawl.yml)
  - 수동: python scripts/news_crawl.py [--days 7] [--extra "키워드1,키워드2"]

필요 환경변수 (GitHub Actions repo secrets로 등록):
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, API_KEY_ENCRYPTION_SECRET
  (NAVER_CLIENT_ID/SECRET, ANTHROPIC_API_KEY는 /admin/api-keys에서 등록한 값을
   Supabase에서 직접 조회 + 복호화해서 사용합니다. 이 스크립트에는 따로 넣지 않습니다.)

데이터 보관 정책:
  - 매 실행 종료 시 cleanup_old_data()가 자동으로 호출되어, article_date /
    period_to 기준 ARTICLE_RETENTION_DAYS(기본 90일 ≈ 3개월)보다 오래된
    news_articles / news_weeks 행을 Supabase에서 삭제합니다.
  - 즉 Supabase에는 최근 3개월치 뉴스만 유지되고, 그 이전 데이터는 자동 정리됩니다.
"""

from __future__ import annotations

import argparse
import email.utils
import json
import os
import smtplib
from email.mime.text import MIMEText
import pathlib
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Optional

import requests
from bs4 import BeautifulSoup

_ROOT = pathlib.Path(__file__).parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from api._shared.keys import resolve_api_key  # noqa: E402

# ============================================================
# 설정 (SH_datanew_crawling/backend/config.py 이식)
# ============================================================
NAVER_SEARCH_API_URL = "https://openapi.naver.com/v1/search/news.json"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
REQUEST_DELAY_SEC = 0.5
HTTP_TIMEOUT_SEC = 10
NAVER_SORT = "date"
NAVER_DISPLAY = 100
NAVER_START_MAX = 1000

SEARCH_QUERIES = [
    "신한카드 빅데이터",
    "신한카드 데이터사업",
    "신한카드 소비트렌드",
    "신한카드 데이터 트렌드",
    "신한카드 데이터",
    "신한카드 소비",
]
MAX_RESULTS_PER_QUERY = 20
COLLECT_DAYS = 7

MAIN_KEYWORDS = ["데이터", "빅데이터", "데이터사업", "트렌드", "소비"]
REGIONAL_BONUS_KEYWORDS = ["지역", "축제", "상권", "골목", "소비패턴", "지역경제", "관광", "유동인구", "동네"]

CATEGORY_TIER = {
    "tier1": {
        "방송/통신": [
            "연합뉴스", "뉴시스", "뉴스1", "연합뉴스TV", "KBS", "MBC", "SBS", "JTBC", "YTN",
            "채널A", "TV조선", "MBN", "한국경제TV", "SBS Biz",
        ],
        "경제": [
            "매일경제", "한국경제", "머니투데이", "이데일리", "파이낸셜뉴스", "아시아경제", "서울경제",
            "헤럴드경제", "비즈워치", "조선비즈", "조세일보",
        ],
        "종합": [
            "경향신문", "국민일보", "동아일보", "문화일보", "서울신문", "세계일보", "조선일보", "중앙일보",
            "한겨레", "한국일보",
        ],
        "IT": ["디지털타임스", "전자신문", "블로터", "디지털데일리", "지디넷코리아", "아이뉴스24"],
    },
    "tier2": {
        "인터넷": ["노컷뉴스", "더팩트", "데일리안", "미디어오늘", "오마이뉴스", "프레시안"],
        "매거진": [
            "매경이코노미", "한경비즈니스", "이코노미스트", "시사저널", "시사IN", "주간동아", "주간조선",
            "중앙SUNDAY", "한겨레21", "더스쿠프", "레이디경향", "주간경향", "신동아", "월간 산",
        ],
        "전문지": [
            "뉴스타파", "코리아헤럴드", "코리아중앙데일리", "동아사이언스", "기자협회보", "농민신문",
            "여성신문", "일다", "코메디닷컴", "헬스조선",
        ],
    },
    "tier3": {
        "지역": [
            "강원도민일보", "강원일보", "경기일보", "국제신문", "대구MBC", "대전일보", "매일신문",
            "부산일보", "전주MBC", "CJB청주방송", "JIBS", "kbc광주방송",
        ],
    },
}
TIER_SCORES = {"tier1": 15, "tier2": 10, "tier3": 5}
DEFAULT_TIER_SCORE = 5

SCORE_BODY_LENGTH_THRESHOLDS = [(1000, 25), (500, 15), (0, 0)]
SCORE_KEYWORD_MAX = 30
SCORE_KEYWORD_PER_HIT = 5
SCORE_NUMERIC_BONUS = 15
SCORE_NAVER_DIRECT = 10
SCORE_EXTERNAL_LINK = 5
SCORE_REGIONAL_BONUS_PER_KW = 3

CLUSTER_SIMILARITY_THRESHOLD = 0.6
CLUSTER_DATE_DIFF_DAYS = 3

CLAUDE_MODEL = "claude-sonnet-4-20250514"
CLAUDE_MAX_TOKENS = 500
CLAUDE_SUMMARY_PROMPT = """당신은 카드사 데이터 비즈니스 전문 에디터입니다.
아래 기사를 3줄 이내로 요약하세요.
신한카드의 데이터 활용 맥락을 중심으로 작성하며,
본문에 없는 내용은 절대 추가하지 마세요.

출력 형식:
요약: (3줄 이내)
키워드: #태그1 #태그2 #태그3

기사 본문:
{article_text}
"""

STOPWORDS = {
    "의", "를", "이", "가", "은", "는", "에", "와", "과", "로", "으로",
    "에서", "까지", "부터", "도", "만", "을", "한", "하는", "하여", "위해",
}
NUMERIC_PATTERN = re.compile(r"\d+[\.,]?\d*\s*(%|억|만|건|명|원|개|배|회|%p|bp)")

PRESS_CODE_MAP = {
    "001": "연합뉴스", "002": "연합뉴스", "003": "뉴시스", "005": "국민일보",
    "009": "매일경제", "011": "서울경제", "018": "이데일리", "020": "동아일보",
    "021": "경향신문", "022": "세계일보", "023": "중앙일보", "025": "한국일보",
    "028": "한겨레", "030": "전자신문", "031": "머니투데이", "032": "매일경제",
    "033": "한국경제", "037": "파이낸셜뉴스", "081": "서울신문", "421": "문화일보",
}


def _strip_html_tags(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\ufeff", "")
    return re.sub(r"<[^>]+>", "", text)


def _parse_pubdate_to_date(pubdate: str) -> Optional[date]:
    try:
        dt = email.utils.parsedate_to_datetime(pubdate)
        return dt.date() if dt else None
    except Exception:
        return None


# ============================================================
# 1) Naver 뉴스 수집 (naver_scraper.py 이식)
# ============================================================
def fetch_query_api(query: str, date_from: str, date_to: str, naver_id: str, naver_secret: str) -> list:
    date_from_d = datetime.strptime(date_from, "%Y-%m-%d").date()
    date_to_d = datetime.strptime(date_to, "%Y-%m-%d").date()

    headers = {
        "X-Naver-Client-Id": naver_id,
        "X-Naver-Client-Secret": naver_secret,
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }

    results: list = []
    display = max(1, min(NAVER_DISPLAY, 100))

    for start in range(1, NAVER_START_MAX + 1, display):
        if len(results) >= MAX_RESULTS_PER_QUERY:
            break

        params = {"query": query, "display": display, "start": start, "sort": NAVER_SORT}
        try:
            resp = requests.get(NAVER_SEARCH_API_URL, headers=headers, params=params, timeout=HTTP_TIMEOUT_SEC)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[naver-api 오류] query='{query}' start={start}: {e}")
            break

        items = data.get("items", []) or []
        if not items:
            break

        for it in items:
            title = _strip_html_tags(it.get("title", ""))
            url = it.get("link") or it.get("originallink") or ""
            snippet = _strip_html_tags(it.get("description", "") or "")
            pubdate = it.get("pubDate", "") or ""

            d = _parse_pubdate_to_date(pubdate)
            if not title or not url or not d:
                continue

            if d < date_from_d:
                return results

            if date_from_d <= d <= date_to_d:
                results.append(
                    {
                        "title": title,
                        "url": url,
                        "source": it.get("source") or "",
                        "date_raw": d.strftime("%Y.%m.%d"),
                        "date": d.strftime("%Y.%m.%d"),
                        "snippet": snippet,
                        "search_query": query,
                    }
                )
                if len(results) >= MAX_RESULTS_PER_QUERY:
                    break

        time.sleep(REQUEST_DELAY_SEC)

    return results[:MAX_RESULTS_PER_QUERY]


def fetch_all_queries(queries: list, date_from: str, date_to: str, week: str, naver_id: str, naver_secret: str) -> list:
    if not queries:
        return []

    results_by_query: dict = {}

    def _worker(q: str):
        return q, fetch_query_api(q, date_from, date_to, naver_id, naver_secret)

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(_worker, q) for q in queries]
        for f in futures:
            q, items = f.result()
            results_by_query[q] = items
            print(f"  [수집] '{q}' -> {len(items)}건")

    all_results = []
    for q in queries:
        all_results.extend(results_by_query.get(q, []))

    for i, a in enumerate(all_results, start=1):
        a["id"] = f"{week}-{i:03d}"
        a["week"] = week

    return all_results


# ============================================================
# 2) 중복 제거 & 클러스터링 (deduplicator.py 이식)
# ============================================================
def extract_nouns(title: str) -> set:
    words = re.findall(r"[가-힣a-zA-Z0-9]{2,}", title)
    return {w for w in words if w not in STOPWORDS}


def similarity(title_a: str, title_b: str) -> float:
    a, b = extract_nouns(title_a), extract_nouns(title_b)
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def parse_date(date_raw: str) -> Optional[datetime]:
    try:
        return datetime.strptime(date_raw, "%Y.%m.%d")
    except Exception:
        return None


def date_diff_days(a: dict, b: dict) -> int:
    da, db = parse_date(a.get("date_raw", "")), parse_date(b.get("date_raw", ""))
    if da and db:
        return abs((da - db).days)
    return 999


def remove_duplicates(articles: list) -> list:
    seen: set = set()
    result = []
    for a in articles:
        url = a.get("url")
        if url and url not in seen:
            seen.add(url)
            result.append(a)
    return result


def cluster_articles(articles: list) -> list:
    clusters = []
    used = [False] * len(articles)

    for i, a in enumerate(articles):
        if used[i]:
            continue
        cluster = [a]
        used[i] = True
        for j, b in enumerate(articles):
            if used[j]:
                continue
            if (
                similarity(a.get("title", ""), b.get("title", "")) >= CLUSTER_SIMILARITY_THRESHOLD
                and date_diff_days(a, b) <= CLUSTER_DATE_DIFF_DAYS
            ):
                cluster.append(b)
                used[j] = True
        clusters.append(cluster)

    return clusters


# ============================================================
# 3) 충실도 스코어링 (scorer.py 이식, 이미지/byline 등 미사용 필드 제외)
# ============================================================
HEADERS = {"User-Agent": USER_AGENT}


def get_source_tier(source: str) -> tuple:
    for tier, categories in CATEGORY_TIER.items():
        for sources in categories.values():
            if source in sources:
                return tier, TIER_SCORES[tier]
    return "unknown", DEFAULT_TIER_SCORE


def _press_code_from_url(url: str) -> str:
    if not url:
        return ""
    m = re.search(r"/article/(\d{3})/", url) or re.search(r"/(\d{3})/", url)
    return m.group(1) if m else ""


def _press_name_from_soup(soup, url: str) -> str:
    og = soup.select_one('meta[property="og:site_name"]')
    if og and og.get("content"):
        return og.get("content", "").strip()
    for sel in ['meta[name="source"]', ".media_end_head_top_logo img[alt]", ".article_info .press"]:
        el = soup.select_one(sel)
        if el:
            name = (el.get("content") or el.get("alt") or el.get_text(strip=True) or "").strip()
            if name:
                return name
    code = _press_code_from_url(url)
    return PRESS_CODE_MAP.get(code, "")


def fetch_article_page(url: str) -> tuple:
    """본문, 언론사명."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            return "", ""
        html = resp.text or ""
        soup = BeautifulSoup(html, "html.parser")

        body_selectors = [
            "#dic_area", "#newsct_article", "div.article_body", "article",
            "[itemprop='articleBody']", "#article-view-content-div", ".article-view-content-div",
            ".article-body", ".news_body", "#news_body_area", ".view_content", "#articleBody", ".article_txt",
        ]

        body = ""
        for sel in body_selectors:
            body_el = soup.select_one(sel)
            if body_el:
                txt = body_el.get_text(separator="\n", strip=True)
                txt = re.sub(r"\n{3,}", "\n\n", txt)
                if len(txt) >= 200:
                    body = txt
                    break
                if not body:
                    body = txt

        if len(body) < 200:
            candidates = [
                soup.select_one("main"), soup.select_one("#container"),
                soup.select_one("#content"), soup.select_one(".content"), soup.select_one("body"),
            ]
            for c in candidates:
                if not c:
                    continue
                paras = []
                for p in c.select("p"):
                    t = p.get_text(" ", strip=True)
                    if len(t) >= 35 and "댓글" not in t and "기자 프로필" not in t:
                        paras.append(t)
                if len(paras) >= 3:
                    body = "\n\n".join(paras)
                    break

        body = re.sub(r"\n{3,}", "\n\n", body).strip()
        source = _press_name_from_soup(soup, url)
        return body, source
    except Exception:
        return "", ""


def score_article(article: dict) -> dict:
    url = article.get("url", "")
    body, source = fetch_article_page(url)
    article["body"] = body
    if source:
        article["source"] = source

    tier, tier_score = get_source_tier(article.get("source", ""))

    s_tier = tier_score

    length = len(body)
    s_length = 0
    for min_len, pts in SCORE_BODY_LENGTH_THRESHOLDS:
        if length >= min_len:
            s_length = pts
            break

    kw_hits = sum(1 for kw in MAIN_KEYWORDS if kw in body)
    s_keyword = min(kw_hits * SCORE_KEYWORD_PER_HIT, SCORE_KEYWORD_MAX)
    if tier == "tier3":
        regional_hits = sum(1 for kw in REGIONAL_BONUS_KEYWORDS if kw in body)
        s_keyword = min(s_keyword + regional_hits * SCORE_REGIONAL_BONUS_PER_KW, SCORE_KEYWORD_MAX)

    s_numeric = SCORE_NUMERIC_BONUS if NUMERIC_PATTERN.search(body) else 0
    s_link = SCORE_NAVER_DIRECT if "n.news.naver.com" in url else SCORE_EXTERNAL_LINK

    total = s_tier + s_length + s_keyword + s_numeric + s_link
    article["score"] = total
    article["score_detail"] = {
        "tier": s_tier, "length": s_length, "keyword": s_keyword, "numeric": s_numeric, "link": s_link,
    }
    article["source_tier"] = tier
    return article


def pick_best_per_cluster(clusters: list) -> list:
    result = []
    for cluster in clusters:
        scored = [score_article(a) for a in cluster]
        scored.sort(key=lambda x: x["score"], reverse=True)
        best = scored[0]
        best["related_articles"] = [
            {"title": a.get("title", ""), "url": a.get("url", ""), "source": a.get("source", "")}
            for a in scored[1:]
        ]
        result.append(best)

    result.sort(key=lambda x: x["score"], reverse=True)
    return result


# ============================================================
# 4) Claude 요약 (summarizer.py 이식)
# ============================================================
def summarize_with_claude(body: str, claude_key: Optional[str]) -> tuple:
    if not claude_key or not body:
        return "", []

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=claude_key)
        prompt = CLAUDE_SUMMARY_PROMPT.format(article_text=body[:3000])
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=CLAUDE_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        response = message.content[0].text

        summary_match = re.search(r"요약:\s*(.+?)(?=키워드:|$)", response, re.DOTALL)
        keyword_match = re.search(r"키워드:\s*(.+)", response)

        summary = summary_match.group(1).strip() if summary_match else response.strip()
        keywords = re.findall(r"#(\S+)", keyword_match.group(1)) if keyword_match else []

        return summary, keywords
    except Exception as e:
        print("[Claude 요약 실패]", str(e))
        return "", []


def generate_summaries(articles: list, claude_key: Optional[str]) -> list:
    for i, article in enumerate(articles):
        print(f"  [요약] {i + 1}/{len(articles)}...")
        article["summary_snippet"] = article.get("snippet", "")

        claude_summary, keywords = summarize_with_claude(article.get("body", ""), claude_key)
        article["summary_claude"] = claude_summary
        if keywords:
            article["keywords"] = keywords

    return articles


# ============================================================
# 5) Supabase 저장
# ============================================================
SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""


def _supabase_headers(prefer: Optional[str] = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _to_iso_date(date_raw: Optional[str]) -> Optional[str]:
    if not date_raw:
        return None
    try:
        return datetime.strptime(date_raw, "%Y.%m.%d").strftime("%Y-%m-%d")
    except Exception:
        return None


def upsert_week(meta: dict) -> None:
    payload = {
        "week": meta["week"],
        "collected_at": meta["collected_at"],
        "period_from": meta["period"]["from"],
        "period_to": meta["period"]["to"],
        "total_raw": meta["total_raw"],
        "total_after_dedup": meta["total_after_dedup"],
        "total_final": meta["total_final"],
        "queries_used": meta["queries_used"],
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/news_weeks",
        headers=_supabase_headers("resolution=merge-duplicates,return=representation"),
        params={"on_conflict": "week"},
        json=payload,
        timeout=20,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase news_weeks upsert 실패 ({resp.status_code}): {resp.text[:300]}")


def upsert_articles(articles: list) -> None:
    if not articles:
        return
    rows = []
    for a in articles:
        rows.append(
            {
                "id": a["id"],
                "week": a.get("week"),
                "article_date": _to_iso_date(a.get("date_raw")),
                "source": a.get("source") or "",
                "source_tier": a.get("source_tier") or "unknown",
                "title": a["title"],
                "summary_snippet": a.get("summary_snippet") or "",
                "summary_claude": a.get("summary_claude") or "",
                "keywords": a.get("keywords") or [],
                "url": a["url"],
                "score": a.get("score"),
                "score_detail": a.get("score_detail"),
                "search_query": a.get("search_query"),
                "related_articles": a.get("related_articles") or [],
            }
        )
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/news_articles",
        headers=_supabase_headers("resolution=merge-duplicates,return=representation"),
        params={"on_conflict": "id"},
        json=rows,
        timeout=30,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase news_articles upsert 실패 ({resp.status_code}): {resp.text[:300]}")


ARTICLE_RETENTION_DAYS = 90


def cleanup_old_data(days: int = ARTICLE_RETENTION_DAYS) -> None:
    """오래된 기사/주차 메타데이터를 삭제합니다 (기본 90일 = 약 3개월)."""
    cutoff = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")

    resp = requests.delete(
        f"{SUPABASE_URL}/rest/v1/news_articles",
        headers=_supabase_headers("return=representation"),
        params={"article_date": f"lt.{cutoff}"},
        timeout=30,
    )
    if resp.status_code >= 400:
        print(f"[정리 실패] news_articles: {resp.status_code} {resp.text[:300]}")
        return
    deleted_articles = len(resp.json() or [])

    resp2 = requests.delete(
        f"{SUPABASE_URL}/rest/v1/news_weeks",
        headers=_supabase_headers("return=representation"),
        params={"period_to": f"lt.{cutoff}"},
        timeout=30,
    )
    if resp2.status_code >= 400:
        print(f"[정리 실패] news_weeks: {resp2.status_code} {resp2.text[:300]}")
        return
    deleted_weeks = len(resp2.json() or [])

    print(f"[정리] {cutoff} 이전 기사 {deleted_articles}건 / 주차 {deleted_weeks}건 삭제 완료")


# ============================================================
# 6) 파이프라인 진입점 (main.py 이식)
# ============================================================
def get_week_range(days: int) -> tuple:
    today = datetime.today()
    start = today - timedelta(days=days)
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def get_week_label(to_date: str) -> str:
    t = datetime.strptime(to_date, "%Y-%m-%d")
    return t.strftime("%Y-W%W")


def run_pipeline(
    date_from: str,
    date_to: str,
    *,
    week: Optional[str] = None,
    queries: Optional[list] = None,
    extra_keywords: Optional[list] = None,
    naver_id: str,
    naver_secret: str,
    claude_key: Optional[str],
) -> tuple[dict, list[str]]:
    if week is None:
        week = get_week_label(date_to)

    queries = list(queries or SEARCH_QUERIES)
    if extra_keywords:
        for kw in extra_keywords:
            kw = (kw or "").strip()
            if kw and kw not in queries:
                queries.append(kw)

    print(f"=== 수집 시작: {week} ({date_from} ~ {date_to}) | 쿼리 {len(queries)}개 ===")

    raw_articles = fetch_all_queries(queries, date_from, date_to, week, naver_id, naver_secret)
    print(f"[수집] 총 {len(raw_articles)}건 원본")

    deduped = remove_duplicates(raw_articles)
    print(f"[중복 제거] {len(raw_articles)} -> {len(deduped)}건")

    clusters = cluster_articles(deduped)
    print(f"[클러스터링] {len(deduped)}건 -> {len(clusters)}개 클러스터")

    picked = pick_best_per_cluster(clusters)
    print(f"[대표 선정] {len(picked)}건 확정")

    articles_final = generate_summaries(picked, claude_key)

    meta = {
        "week": week,
        "collected_at": date_to,
        "period": {"from": date_from, "to": date_to},
        "total_raw": len(raw_articles),
        "total_after_dedup": len(deduped),
        "total_final": len(picked),
        "queries_used": queries,
    }

    upsert_week(meta)
    upsert_articles(articles_final)
    cleanup_old_data()

    print(f"=== 완료: {len(picked)}건 Supabase 저장 ===")
    titles = [str(a.get("title") or "") for a in articles_final]
    return meta, titles


def kst_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=9)


def interval_due(interval: str, now: datetime) -> bool:
    if interval in ("daily", "after_crawl"):
        return True
    if interval == "weekly":
        return now.weekday() == 0
    if interval == "monthly":
        return now.day == 1
    return True


def load_crawl_settings() -> dict:
    defaults = {
        "keywords": list(SEARCH_QUERIES),
        "collectInterval": "weekly",
        "collectDays": COLLECT_DAYS,
        "emailInterval": "weekly",
        "recipientEmails": [],
    }
    raw = resolve_api_key("NEWS_CRAWL_SETTINGS")
    if not raw:
        return defaults
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("[설정] 저장된 뉴스 설정을 읽지 못해 기본값을 사용합니다.")
        return defaults

    keywords = [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()]
    emails = [str(e).strip() for e in (data.get("recipientEmails") or []) if "@" in str(e)]
    try:
        days = int(data.get("collectDays") or COLLECT_DAYS)
    except (TypeError, ValueError):
        days = COLLECT_DAYS
    collect_interval = data.get("collectInterval") if data.get("collectInterval") in ("daily", "weekly", "monthly") else "weekly"
    email_interval = data.get("emailInterval") if data.get("emailInterval") in ("off", "after_crawl", "daily", "weekly") else "weekly"
    return {
        "keywords": keywords or defaults["keywords"],
        "collectInterval": collect_interval,
        "collectDays": min(90, max(1, days)),
        "emailInterval": email_interval,
        "recipientEmails": emails,
    }


def send_news_email(recipients: list[str], titles: list[str], date_from: str, date_to: str) -> None:
    username = resolve_api_key("SMTP_USERNAME")
    password = resolve_api_key("SMTP_PASSWORD")
    if not username or not password:
        print("[메일] SMTP 계정이 없어 발송을 건너뜁니다.")
        return

    lines = [f"수집 기간: {date_from} ~ {date_to}", f"기사 {len(titles)}건", ""]
    lines.extend(f"- {title}" for title in titles[:30] if title)
    if len(titles) > 30:
        lines.append(f"... 외 {len(titles) - 30}건")
    message = MIMEText("\n".join(lines), "plain", "utf-8")
    message["Subject"] = f"데이터뉴스 수집 결과 ({date_to})"
    message["From"] = username
    message["To"] = ", ".join(recipients)

    server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    try:
        with smtplib.SMTP(server, port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(username, password.replace(" ", ""))
            smtp.sendmail(username, recipients, message.as_string())
        print(f"[메일] {len(recipients)}명에게 발송했습니다.")
    except Exception as exc:
        print(f"[메일 실패] {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="데이터뉴스 수집 파이프라인")
    parser.add_argument("--days", type=int, default=None, help="오늘 기준 수집 기간(일). 없으면 관리자 설정값")
    parser.add_argument("--date-from", default=None, help="YYYY-MM-DD (지정 시 --days 무시)")
    parser.add_argument("--date-to", default=None, help="YYYY-MM-DD")
    parser.add_argument("--extra", default="", help="추가 검색 키워드 (쉼표로 구분)")
    parser.add_argument("--force", action="store_true", help="수집 주기와 관계없이 실행")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[오류] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.")
        sys.exit(1)

    settings = load_crawl_settings()
    now = kst_now()
    if not args.force and not (args.date_from and args.date_to):
        if not interval_due(settings["collectInterval"], now):
            print(f"[건너뜀] 오늘은 수집 주기({settings['collectInterval']})가 아닙니다.")
            return

    if args.date_from and args.date_to:
        date_from, date_to = args.date_from, args.date_to
    else:
        date_from, date_to = get_week_range(args.days if args.days is not None else settings["collectDays"])
    week = get_week_label(date_to)
    extra_keywords = [k.strip() for k in args.extra.split(",") if k.strip()] if args.extra else None

    naver_id = resolve_api_key("NAVER_CLIENT_ID")
    naver_secret = resolve_api_key("NAVER_CLIENT_SECRET")
    claude_key = resolve_api_key("ANTHROPIC_API_KEY")

    if not naver_id or not naver_secret:
        print("[오류] NAVER_CLIENT_ID/SECRET이 등록되어 있지 않습니다. /admin/api-keys에서 등록해주세요.")
        sys.exit(1)

    if not claude_key:
        print("[안내] ANTHROPIC_API_KEY가 없어 Claude 요약 없이 진행합니다 (네이버 snippet만 사용).")

    _meta, titles = run_pipeline(
        date_from,
        date_to,
        week=week,
        queries=settings["keywords"],
        extra_keywords=extra_keywords,
        naver_id=naver_id,
        naver_secret=naver_secret,
        claude_key=claude_key,
    )

    email_interval = settings["emailInterval"]
    recipients = settings["recipientEmails"]
    should_email = bool(recipients) and email_interval != "off" and (
        args.force or email_interval == "after_crawl" or interval_due(email_interval, now)
    )
    if should_email:
        send_news_email(recipients, titles, date_from, date_to)
    elif email_interval == "off":
        print("[메일] 발송 주기가 사용 안 함이라 건너뜁니다.")


if __name__ == "__main__":
    main()
