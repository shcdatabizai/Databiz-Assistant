"""
dashboard_generator.py
======================
매월 실행하면 소비 데이터 대시보드 HTML을 생성합니다.
공휴일 정보는 holiday_fetcher.py에서 가져옵니다.

사용법:
    python dashboard_generator.py

설정 (아래 CONFIG만 수정):
    DATA_DIR      : chunk 파일들이 있는 폴더
    OUTPUT_FILE   : 생성될 HTML 파일명
    TARGET_YEAR   : 당월 연도
    TARGET_MONTH  : 당월 월
    PREV_YEAR     : 전년 연도
    PREV_MONTH    : 전년 월
    CHUNK_PATTERN : chunk 파일 glob 패턴
"""

import os, glob, json, sys
import pandas as pd
import numpy as np

# ─────────────────────────────────────────────
# ⚙️  매달 여기만 수정
DATA_DIR      = r"d:\Cursor\report_agent_r\source"
OUTPUT_FILE   = "dashboard_202602.html"
TARGET_YEAR   = 2026
TARGET_MONTH  = 2
PREV_YEAR     = 2025
PREV_MONTH    = 2
CHUNK_PATTERN = "chunk_*.csv"
SOURCE_FILE   = r"d:\Cursor\report_agent_r\source\IDX_01_202602 (7).csv"
# ─────────────────────────────────────────────


def _apply_env_overrides():
    """
    UI/API에서 subprocess로 실행할 때 환경변수로 덮어쓴다 (기본 CONFIG 유지).
    - DG_YM: YYYYMM (예: 202602)
    - DG_SOURCE_FILE: 업로드된 원본 CSV 절대/상대 경로
    - DG_DATA_DIR: 대시보드 HTML 등 출력 폴더 (미설정 시 기본 DATA_DIR)
    - DG_OUTPUT_FILE: 대시보드 HTML 파일명 (미설정 시 dashboard_{DG_YM}.html)
    DG_YM이 없으면 DG_SOURCE_FILE 파일명에서 pipelines.parse_ym 규칙으로 추론한다.
    """
    global DATA_DIR, OUTPUT_FILE, TARGET_YEAR, TARGET_MONTH, PREV_YEAR, PREV_MONTH
    global SOURCE_FILE, YEAR_MONTH_LABEL, PREV_LABEL

    ym = os.environ.get("DG_YM", "").strip()
    sf = os.environ.get("DG_SOURCE_FILE", "").strip()
    if sf:
        SOURCE_FILE = sf
    if not ym and SOURCE_FILE:
        try:
            from pipelines.parse_ym import parse_ym_from_filename

            ym = parse_ym_from_filename(os.path.basename(SOURCE_FILE)) or ""
        except Exception:
            ym = ""
    if ym and len(ym) == 6 and ym.isdigit():
        tm = int(ym[4:6])
        if 1 <= tm <= 12:
            TARGET_YEAR = int(ym[:4])
            TARGET_MONTH = tm
            PREV_YEAR = TARGET_YEAR - 1
            PREV_MONTH = TARGET_MONTH
            if not os.environ.get("DG_OUTPUT_FILE", "").strip():
                OUTPUT_FILE = f"dashboard_{ym}.html"
    dd = os.environ.get("DG_DATA_DIR", "").strip()
    if dd:
        DATA_DIR = dd
    of = os.environ.get("DG_OUTPUT_FILE", "").strip()
    if of:
        OUTPUT_FILE = of
    YEAR_MONTH_LABEL = f"{TARGET_YEAR}년 {TARGET_MONTH}월"
    PREV_LABEL = f"{PREV_YEAR}년 {PREV_MONTH}월"


_apply_env_overrides()


# ── holiday_fetcher 로드 (같은 디렉터리에서) ──
def _load_holiday_labels():
    """
    holiday_fetcher.py 가 같은 폴더에 있으면 주차별 라벨 반환.
    없거나 API 키 미설정이면 기본 라벨("1주차" 등) 반환.
    """
    try:
        import importlib.util
        module_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "holiday_fetcher.py")
        spec = importlib.util.spec_from_file_location("_holiday_fetcher_local", module_path)
        if spec is None or spec.loader is None:
            raise ImportError("holiday_fetcher.py 모듈 로딩 실패")
        hf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hf)
        if hf.API_KEY == "YOUR_API_KEY_HERE":
            print("[주의] holiday_fetcher.py의 API_KEY를 설정해주세요. 기본 라벨로 진행합니다.")
            return None, None
        print(f"공휴일 조회 중: {TARGET_YEAR}년 {TARGET_MONTH}월 / {PREV_YEAR}년 {PREV_MONTH}월")
        cur_labels  = hf.make_week_labels(TARGET_YEAR, TARGET_MONTH)
        prev_labels = hf.make_week_labels(PREV_YEAR,   PREV_MONTH)
        return cur_labels, prev_labels
    except ImportError:
        print("[주의] holiday_fetcher.py를 찾을 수 없습니다. 기본 라벨로 진행합니다.")
        return None, None
    except Exception as e:
        print(f"[주의] 공휴일 조회 실패 ({e}). 기본 라벨로 진행합니다.")
        return None, None


def _load_holiday_week_table(cur_holiday_labels=None, prev_holiday_labels=None):
    """
    주차(wdn)별 공휴일 테이블용 데이터 생성.

    반환 예시:
      {
        "cur_year": 2026, "cur_month": 2,
        "prev_year": 2025, "prev_month": 2,
        "weeks": [
          {"wdn":"1","cur_range":"02/01~02/01","prev_range":"02/01~02/02",
           "cur_holidays":["02/03 대체공휴일"],"prev_holidays":[]},
          ...
        ]
      }
    """
    def _extract_holidays_from_label(lbl):
        if not lbl:
            return []
        lbl = str(lbl)
        if "🎌" in lbl:
            tail = lbl.split("🎌", 1)[1].strip()
            return [x.strip() for x in tail.split(" / ") if x.strip()]
        if ")" in lbl:
            tail = lbl.rsplit(")", 1)[1].strip()
            tail = tail.replace("\\n", " ").replace("\n", " ").strip()
            if not tail:
                return []
            if " / " in tail:
                return [x.strip() for x in tail.split(" / ") if x.strip()]
            return [tail]
        return [lbl.strip()]

    try:
        import importlib.util
        module_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "holiday_fetcher.py")
        spec = importlib.util.spec_from_file_location("_holiday_fetcher_local", module_path)
        if spec is None or spec.loader is None:
            raise ImportError("holiday_fetcher.py 모듈 로딩 실패")
        hf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hf)

        # range는 API 없이도 계산 가능
        cur_ranges = hf.get_week_ranges(TARGET_YEAR, TARGET_MONTH)
        prev_ranges = hf.get_week_ranges(PREV_YEAR, PREV_MONTH)

        def _detail_from_map(holidays_map):
            # holiday_fetcher.get_week_holiday_detail()이 없을 때를 대비한 동일 포맷 변환
            result = {}
            for wdn, events in (holidays_map or {}).items():
                seen = set()
                items = []
                for e in sorted(events, key=lambda x: x["date"]):
                    k = (e["date"], e.get("name"))
                    if k in seen:
                        continue
                    seen.add(k)
                    items.append(f"{e['date'].strftime('%m/%d')} {e['name']}")
                result[wdn] = items
            return result

        # 공휴일 상세는 API 호출 실패 시 빈 배열로 폴백
        if getattr(hf, "API_KEY", None) == "YOUR_API_KEY_HERE":
            cur_detail = {k: [] for k in cur_ranges.keys()}
            prev_detail = {k: [] for k in prev_ranges.keys()}
        else:
            print(f"공휴일 상세 조회 중: {TARGET_YEAR}년 {TARGET_MONTH}월 / {PREV_YEAR}년 {PREV_MONTH}월")
            if hasattr(hf, "get_week_holiday_detail"):
                cur_detail = hf.get_week_holiday_detail(TARGET_YEAR, TARGET_MONTH)
                prev_detail = hf.get_week_holiday_detail(PREV_YEAR, PREV_MONTH)
            else:
                cur_detail = {}
                prev_detail = {}
                try:
                    cur_map = hf.map_holidays_to_weeks(TARGET_YEAR, TARGET_MONTH)
                    cur_detail = _detail_from_map(cur_map)
                except Exception:
                    cur_detail = {k: [] for k in cur_ranges.keys()}
                try:
                    prev_map = hf.map_holidays_to_weeks(PREV_YEAR, PREV_MONTH)
                    prev_detail = _detail_from_map(prev_map)
                except Exception:
                    prev_detail = {k: [] for k in prev_ranges.keys()}

        def _range_str(rng):
            if not rng:
                return ""
            s, e = rng
            # range 표시에서 월(mm)을 제거하고 일(dd)만 보여줌
            sd = s.strftime('%d')
            ed = e.strftime('%d')
            return sd if sd == ed else f"{sd}~{ed}"

        weeks = []
        # 데이터(wdn 컬럼) 및 차트는 당월 기준 주차를 중심으로 렌더링
        for wdn in sorted(cur_ranges.keys(), key=int):
            cur_rng = cur_ranges.get(wdn)
            prev_rng = prev_ranges.get(wdn)
            weeks.append({
                "wdn": wdn,
                "cur_range": _range_str(cur_rng),
                "prev_range": _range_str(prev_rng),
                "cur_holidays": cur_detail.get(wdn, []),
                "prev_holidays": prev_detail.get(wdn, []),
            })

        # 상세(API 호출) 결과가 비어있으면, 이미 생성된 라벨에서 휴일명을 파싱해 폴백
        if cur_holiday_labels and weeks and (not any(w["cur_holidays"] for w in weeks)):
            for w in weeks:
                w["cur_holidays"] = _extract_holidays_from_label(cur_holiday_labels.get(w["wdn"]))
                if prev_holiday_labels is not None:
                    w["prev_holidays"] = _extract_holidays_from_label(prev_holiday_labels.get(w["wdn"]))

        return {
            "cur_year": TARGET_YEAR,
            "cur_month": TARGET_MONTH,
            "prev_year": PREV_YEAR,
            "prev_month": PREV_MONTH,
            "weeks": weeks,
        }
    except ImportError:
        print("[주의] holiday_fetcher.py를 찾을 수 없습니다. 공휴일 테이블은 빈 데이터로 진행합니다.")
    except Exception as e:
        print(f"[주의] 공휴일 테이블 조회 실패 ({e}). 공휴일은 빈 데이터로 진행합니다.")

    # 폴백(빈 weeks + range는 빈 문자열)
    return {
        "cur_year": TARGET_YEAR,
        "cur_month": TARGET_MONTH,
        "prev_year": PREV_YEAR,
        "prev_month": PREV_MONTH,
        "weeks": [],
    }


def _default_wdn_label(wdn_str):
    return f"{wdn_str}주차"


# 집계에 필요한 컬럼만 로드 (메모리 최적화)
_NEEDED_COLS = [
    "age_gp", "sex_ccd", "cty_nm", "ry_nm", "wdn", "trns_tm_gp",
    "hpsn_ry_sl_cz_nm",  # 세부업종(중분류)
    "dist_gp",  # 동일지역/외지유입 구분용
    "est_amt", "est_amt_bf", "est_cnt", "est_cnt_bf", "dy_cnt", "dy_cnt_bf",
]
_CAT_COLS    = ["age_gp", "sex_ccd", "ry_nm", "hpsn_ry_sl_cz_nm", "trns_tm_gp"]  # dist_gp는 전처리에서 따로 처리
_NUM_COLS    = ["est_amt", "est_amt_bf", "est_cnt", "est_cnt_bf", "dy_cnt", "dy_cnt_bf"]

# 스키마 변경 시 별칭(대소문자는 별도로 무시하고 매칭)
_COLUMN_ALIASES = {
    "wdn": ("week_num", "week_no", "wdn_cd", "WDN"),
    "dy_cnt": ("dycnt", "dy_cnt_cur", "cur_dy_cnt", "DY_CNT"),
    "dy_cnt_bf": ("dycnt_bf", "dy_cnt_prev", "prev_dy_cnt", "DY_CNT_BF"),
}

# 파일에 없을 때 일일평균 분모용 (0이면 daily_amt에서 0으로 나뉨)
_NUM_DEFAULT_IF_MISSING = {"dy_cnt": 1.0, "dy_cnt_bf": 1.0}
_TEXT_DEFAULT_IF_MISSING = {
    "dist_gp": "미확인",
    "hpsn_ry_sl_cz_nm": "미분류",
}


def _norm_header_key(name: str) -> str:
    s = str(name).strip().lstrip("\ufeff")
    return s.lower()


_CSV_ENCODINGS = ("utf-8-sig", "utf-8", "cp949")


def _detect_csv_encoding(path: str) -> str:
    """api/main.py\uc758 _csv_scan\uacfc \ub3d9\uc77c\ud55c \uc21c\uc11c(utf-8-sig -> utf-8 -> cp949)\ub85c \uc778\ucf54\ub529\uc744 \ud0d0\uc9c0."""
    last_err: Exception | None = None
    for enc in _CSV_ENCODINGS:
        try:
            pd.read_csv(path, encoding=enc, nrows=5)
            return enc
        except (UnicodeDecodeError, UnicodeError) as e:
            last_err = e
            continue
    raise ValueError(f"CSV \uc778\ucf54\ub529\uc744 \ud655\uc778\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4({path}): {last_err}")


def _csv_header_columns(path: str) -> list[str]:
    enc = _detect_csv_encoding(path)
    h = pd.read_csv(path, encoding=enc, nrows=0)
    return [str(c).strip().lstrip("\ufeff") for c in h.columns]


def _resolve_needed_columns(
    file_cols: list[str], needed: list[str]
) -> tuple[dict[str, str], list[str]]:
    """표준 컬럼명 -> 파일 내 실제 컬럼명. 매칭 실패한 표준명 목록을 둘째로 반환."""
    by_key: dict[str, str] = {}
    for c in file_cols:
        by_key[_norm_header_key(c)] = c
    canon_to_file: dict[str, str] = {}
    missing: list[str] = []
    for want in needed:
        wk = _norm_header_key(want)
        if wk in by_key:
            canon_to_file[want] = by_key[wk]
            continue
        found = False
        for alt in _COLUMN_ALIASES.get(want, ()):
            ak = _norm_header_key(alt)
            if ak in by_key:
                canon_to_file[want] = by_key[ak]
                found = True
                break
        if not found:
            missing.append(want)
    return canon_to_file, missing


# ── 데이터 로드 ──────────────────────────────
def load_all_chunks(chunksize: int = 500_000):
    """
    원본 데이터를 로드한다. Parquet 우선, CSV fallback.
    - Parquet: 직접 로드 (5-10배 빠름)
    - CSV: chunksize 단위로 나눠 읽어 메모리 피크를 줄인다.
    """
    if not os.path.exists(SOURCE_FILE):
        raise FileNotFoundError(f"원본 데이터 파일을 찾을 수 없습니다: {SOURCE_FILE}")
    print(f"원본 파일 로드 중... {os.path.basename(SOURCE_FILE)}")

    # Parquet 우선 로드. 컬럼명이 표준명과 다르면 CSV와 같은 별칭 규칙으로 맞춘다.
    if SOURCE_FILE.endswith('.parquet'):
        print(f"  [Parquet 로드] {os.path.basename(SOURCE_FILE)}")
        import pyarrow.parquet as pq

        file_cols = [str(c) for c in pq.ParquetFile(SOURCE_FILE).schema_arrow.names]
        canon_to_file, missing_std = _resolve_needed_columns(file_cols, _NEEDED_COLS)
        hard_missing = [
            c
            for c in missing_std
            if c not in _NUM_DEFAULT_IF_MISSING and c not in _TEXT_DEFAULT_IF_MISSING
        ]
        if hard_missing:
            raise ValueError(
                "집계에 필요한 컬럼이 parquet에 없습니다: "
                + ", ".join(hard_missing)
                + f". 컬럼 앞부분: {file_cols[:40]}"
            )
        use_actual = [canon_to_file[c] for c in _NEEDED_COLS if c in canon_to_file]
        df = pd.read_parquet(SOURCE_FILE, columns=use_actual)
        df.rename(columns={canon_to_file[c]: c for c in _NEEDED_COLS if c in canon_to_file}, inplace=True)
        for c in missing_std:
            if c in _NUM_DEFAULT_IF_MISSING:
                df[c] = np.float32(_NUM_DEFAULT_IF_MISSING[c])
            elif c in _TEXT_DEFAULT_IF_MISSING:
                df[c] = _TEXT_DEFAULT_IF_MISSING[c]
        print(f"  로드 완료: {len(df):,}행 × {len(df.columns)}컬럼")
        # 타입 캐스팅
        for c in _NUM_COLS:
            if c in df.columns:
                df[c] = df[c].astype("float32")
        for c in _CAT_COLS:
            if c in df.columns:
                try:
                    df[c] = df[c].astype("category")
                except MemoryError:
                    print(f"  [WARN] {c} category 변환 생략 (메모리 부족)")
        return df

    # CSV 읽기 (fallback)
    file_cols = _csv_header_columns(SOURCE_FILE)
    canon_to_file, missing_std = _resolve_needed_columns(file_cols, _NEEDED_COLS)
    if "wdn" not in canon_to_file:
        raise ValueError(
            "필수 컬럼 'wdn'을 CSV에서 찾을 수 없습니다. "
            "헤더 대소문자·공백·BOM은 자동 처리합니다. "
            f"앞부분 헤더: {file_cols[:40]}"
        )
    fill_defaults = [c for c in missing_std if c in _NUM_DEFAULT_IF_MISSING]
    hard_missing = [
        c
        for c in missing_std
        if c not in _NUM_DEFAULT_IF_MISSING and c not in _TEXT_DEFAULT_IF_MISSING
    ]
    if hard_missing:
        raise ValueError(
            "집계에 필요한 컬럼이 CSV에 없습니다: "
            + ", ".join(hard_missing)
            + f". 헤더 앞부분: {file_cols[:40]}"
        )
    if fill_defaults:
        print(
            f"  [주의] 다음 컬럼은 파일에 없어 기본값으로 채웁니다: {fill_defaults} "
            f"(일일평균 분모용 기본 {_NUM_DEFAULT_IF_MISSING})"
        )

    use_actual = [canon_to_file[c] for c in _NEEDED_COLS if c in canon_to_file]
    rename_to_canon = {canon_to_file[c]: c for c in _NEEDED_COLS if c in canon_to_file}

    chunks = []
    total_rows = 0

    csv_encoding = _detect_csv_encoding(SOURCE_FILE)
    reader = pd.read_csv(
        SOURCE_FILE,
        encoding=csv_encoding,
        encoding_errors="replace",
        usecols=use_actual,
        chunksize=chunksize,  # 한 번에 chunksize 행씩 읽기
    )

    for i, chunk in enumerate(reader, start=1):
        chunk.rename(columns=rename_to_canon, inplace=True)
        for c in _NEEDED_COLS:
            if c not in chunk.columns:
                if c in _NUM_DEFAULT_IF_MISSING:
                    chunk[c] = np.float32(_NUM_DEFAULT_IF_MISSING[c])
                elif c in _TEXT_DEFAULT_IF_MISSING:
                    chunk[c] = _TEXT_DEFAULT_IF_MISSING[c]
        n = len(chunk)
        total_rows += n
        # 숫자/카테고리형 캐스팅은 chunk 단위로 수행
        for c in _NUM_COLS:
            if c in chunk.columns:
                chunk[c] = pd.to_numeric(chunk[c], errors="coerce").fillna(0).astype("float32")
        for c in _CAT_COLS:
            if c in chunk.columns:
                chunk[c] = chunk[c].astype("category")
        chunks.append(chunk)
        print(f"  chunk {i}: {n:,}행 누적 ({total_rows:,}행)")

    if not chunks:
        raise RuntimeError("원본 데이터 파일에서 유효한 행을 읽지 못했습니다.")

    df = pd.concat(chunks, ignore_index=True)

    if len(df) != total_rows:
        raise RuntimeError(
            f"데이터 손실 감지: 누적 행 수={total_rows:,}, concat 후 행 수={len(df):,}"
        )

    print(f"\n로드 완료: {len(df):,}행 (chunksize={chunksize})")
    return df


# ── 전처리 ───────────────────────────────────
def _map_sex_token(x):
    """단일 값 → M/F/U (범주 매핑용, 전체 Series str 연산보다 메모리 부담이 작음)."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return "U"
    t = str(x).strip().upper()
    if t in ("M", "1", "남", "MALE"):
        return "M"
    if t in ("F", "2", "여", "FEMALE"):
        return "F"
    return "U"


def _normalize_sex_ccd(s):
    """데이터 소스에 따라 1/2, M/F, 남/여 등이 섞일 수 있어 M/F로 통일.
    category dtype이면 범주 목록만 변환해 수백만 행에 str 연산을 돌리지 않음."""
    if pd.api.types.is_categorical_dtype(s):
        cat_map = {c: _map_sex_token(c) for c in s.cat.categories}
        return s.cat.rename_categories(cat_map).astype("category")
    # 비범주(object 등): 범주 수가 적으면 astype category 후 동일 처리
    u = s.dropna().unique()
    if len(u) <= 64:
        lut = {k: _map_sex_token(k) for k in u}
        return s.map(lut).fillna("U").astype("category")
    return (
        s.astype(str)
        .str.strip()
        .str.upper()
        .map(lambda t: "M" if t in ("M", "1", "남", "MALE") else ("F" if t in ("F", "2", "여", "FEMALE") else "U"))
        .astype("category")
    )


def preprocess(df):
    # wdn: 숫자로 읽어 문자열 주차 키만 만듦 (대용량 str.replace/strip 회피)
    _w = pd.to_numeric(df["wdn"], errors="coerce").fillna(0).astype(np.int64)
    df["wdn"] = _w.astype(str)
    # cty_nm: 집계·그룹바이만 하므로 결측만 치환. astype(str)/strip 없음(대용량 메모리·불필요 복사 방지).
    df["cty_nm"] = df["cty_nm"].fillna("미확인")
    # dist_gp: 방문 거리/유입 구분 → 동일지역/외지유입 분석용
    # 예: "1_근거리", "2_중거리", "3_외지유입"
    if "dist_gp" in df.columns:
        df["dist_gp"] = df["dist_gp"].fillna("미확인").astype(str)
        mask = df["dist_gp"].str.contains("외지유입", na=False)
        df["dist_type"] = np.where(mask, "외지유입", "동일지역/근거리")
        try:
            df["dist_gp"] = df["dist_gp"].astype("category")
            df["dist_type"] = df["dist_type"].astype("category")
        except MemoryError:
            pass
    df["sex_ccd"] = _normalize_sex_ccd(df["sex_ccd"])
    return df


# ── 집계 ─────────────────────────────────────
def agg_by(df, cols, sort=None, sort_by=None):
    # Backward/forward compatibility: some call sites pass `sort_by=...`.
    if sort is None and sort_by is not None:
        sort = sort_by
    g = df.groupby(cols, as_index=False, observed=True).agg(
        est_amt    =("est_amt",    "sum"),
        est_amt_bf =("est_amt_bf", "sum"),
        est_cnt    =("est_cnt",    "sum"),
        est_cnt_bf =("est_cnt_bf", "sum"),
        dy_cnt     =("dy_cnt",     "max"),
        dy_cnt_bf  =("dy_cnt_bf",  "max"),
    )
    # float32 → float64 (JSON 직렬화 호환)
    for _c in ["est_amt","est_amt_bf","est_cnt","est_cnt_bf","dy_cnt","dy_cnt_bf"]:
        if _c in g.columns:
            g[_c] = g[_c].astype("float64")
    g["yoy_amt_pct"]   = np.where(g["est_amt_bf"]>0, (g["est_amt"]-g["est_amt_bf"])/g["est_amt_bf"]*100, np.nan)
    g["yoy_cnt_pct"]   = np.where(g["est_cnt_bf"]>0, (g["est_cnt"]-g["est_cnt_bf"])/g["est_cnt_bf"]*100, np.nan)
    g["daily_amt"]     = np.where(g["dy_cnt"]>0,    g["est_amt"]/g["dy_cnt"],    0)
    g["daily_amt_bf"]  = np.where(g["dy_cnt_bf"]>0, g["est_amt_bf"]/g["dy_cnt_bf"], 0)
    g["yoy_daily_pct"] = np.where((g["daily_amt_bf"]>0)&(g["daily_amt"]>0),
                                   (g["daily_amt"]-g["daily_amt_bf"])/g["daily_amt_bf"]*100, np.nan)
    g["atv"]           = np.where(g["est_cnt"]>0,    g["est_amt"]/g["est_cnt"],    np.nan)
    g["atv_bf"]        = np.where(g["est_cnt_bf"]>0, g["est_amt_bf"]/g["est_cnt_bf"], np.nan)
    g["yoy_atv_pct"]   = np.where((g["atv_bf"]>0)&(~np.isnan(g["atv"])),
                                   (g["atv"]-g["atv_bf"])/g["atv_bf"]*100, np.nan)
    if sort:
        g = g.sort_values(sort)
    return g


# ── JSON 헬퍼 ────────────────────────────────
class _NpEncoder(json.JSONEncoder):
    """numpy 스칼라/배열을 Python 기본형으로 변환."""
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.ndarray):  return obj.tolist()
        return super().default(obj)

def _json_sanitize(obj):
    """JSON에 NaN/Inf가 들어가면 브라우저 JSON.parse가 실패하므로 null로 치환."""
    if isinstance(obj, dict):
        return {k: _json_sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_sanitize(x) for x in obj]
    if isinstance(obj, (float, np.floating)):
        v = float(obj)
        if np.isnan(v) or np.isinf(v):
            return None
        return v
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


def _jdumps(obj):
    return json.dumps(_json_sanitize(obj), ensure_ascii=False, cls=_NpEncoder)

def jlist(s, div=1e8, d=0):
    """거래금액 등(억 단위): 기본 소수점 없음."""
    return (s / div).round(d).tolist()

def safe_yoy(s):
    """YoY %: 소수 둘째 자리까지."""
    return s.round(2).fillna(0).tolist()

def safe_val(v):
    """YoY % 등: 소수 둘째 자리까지."""
    if v is None: return None
    if isinstance(v, float) and np.isnan(v): return None
    return float(round(v, 2))

# ── 10세 단위 연령대 매핑 ──────────────────────────
AGE10_MAP = {
    "01_19세이하": "19세이하",
    "02_20-24세":  "20대", "03_25-29세": "20대",
    "04_30-34세":  "30대", "05_35-39세": "30대",
    "06_40-44세":  "40대", "07_45-49세": "40대",
    "08_50-54세":  "50대", "09_55-59세": "50대",
    "10_60-64세":  "60대이상", "11_65세이상": "60대이상",
}
AGE10_ORDER = ["19세이하", "20대", "30대", "40대", "50대", "60대이상"]

def _agg_age10(sub_df):
    """age_gp → 10세 단위로 재집계 후 AGE10_ORDER 순으로 정렬."""
    s = sub_df.copy()
    s["_age10"] = s["age_gp"].map(AGE10_MAP)
    s = s[s["_age10"].notna()]
    g = agg_by(s, ["_age10"]).rename(columns={"_age10": "age10"})
    g = g.set_index("age10").reindex(AGE10_ORDER).reset_index()
    g[["est_amt", "est_amt_bf"]] = g[["est_amt", "est_amt_bf"]].fillna(0)
    return g


# ── HTML 생성 ─────────────────────────────────
def build_html(kpi_j, ry_j, cty_j, wdn_j, tm_j, age_j, hol_j, tbl_j, cty_flow_j):
    return """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>소비 대시보드 — """ + YEAR_MONTH_LABEL + """</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0f1117;--card:#1a1d27;--border:#2a2d3e;--accent:#4f8ef7;--pos:#34d399;--neg:#f87171;--line:#f59e0b;--hol:#f59e0b;--text:#e2e8f0;--muted:#64748b}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;padding:28px}
h1{font-size:1.55rem;font-weight:700;margin-bottom:4px}
.sub{color:var(--muted);font-size:.86rem;margin-bottom:24px}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px}
.kpi-lbl{color:var(--muted);font-size:.76rem;margin-bottom:6px}
.kpi-val{font-size:1.85rem;font-weight:700}
.kpi-sub{font-size:.8rem;color:var(--muted);margin-top:4px}
.kpi-yoy{font-size:.9rem;font-weight:600;margin-top:6px}
.pos{color:var(--pos)}.neg{color:var(--neg)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px}
.card h2{font-size:.96rem;font-weight:600;margin-bottom:12px}
.cw{position:relative}
.tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.tab{padding:4px 12px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:.78rem;background:transparent;color:var(--muted)}
.tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.winfo{font-size:.71rem;color:var(--muted);margin-top:8px;line-height:1.8}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{color:var(--muted);text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);font-weight:500;white-space:nowrap;cursor:pointer;user-select:none}
th:hover{color:var(--text)}
th .sort-icon{font-size:.7rem;margin-left:3px;opacity:.5}
th.sort-asc .sort-icon::after{content:'△';opacity:1;color:var(--accent)}
th.sort-desc .sort-icon::after{content:'▽';opacity:1;color:var(--accent)}
th:not(.sort-asc):not(.sort-desc) .sort-icon::after{content:'△▽'}
td{padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}
tr:hover td{background:rgba(79,142,247,.06)}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.7rem;background:rgba(79,142,247,.15);color:var(--accent);margin-left:8px;font-weight:400}
.tbl-wrap{overflow-x:auto}
.holiday-badge{font-size:.68rem;color:var(--line);margin-left:4px}

/* ── 공휴일 테이블 ── */
.hol-table{width:100%;border-collapse:collapse;font-size:.82rem;table-layout:fixed}
.hol-table th{color:var(--muted);font-weight:600;padding:6px 12px;border-bottom:2px solid var(--border);text-align:left;white-space:nowrap}
.hol-table th.year-col{text-align:center}
.hol-table td{padding:4px 12px;vertical-align:top;border-bottom:1px solid rgba(42,45,62,.6)}
.hol-table td.wdn-col{color:var(--muted);font-size:.78rem;font-weight:600;white-space:nowrap;width:52px}
.hol-table td.range-col{color:var(--muted);font-size:.76rem;white-space:nowrap}
.hol-table td.hol-date-cell{color:var(--muted);font-size:.76rem;white-space:nowrap;width:78px}
.hol-table td.hol-hol-cell{color:var(--hol);font-size:.78rem;white-space:nowrap}
.hol-table td.cur-date-col,.hol-table td.cur-hol-col{border-left:2px solid var(--border)}
.hol-table td.wdn-col,.hol-table td.hol-date-cell,.hol-table td.hol-hol-cell{box-sizing:border-box}
.hol-table tr.week-sep td{padding-top:8px;border-top:1px solid var(--border)}
.hol-table tr:last-child td{border-bottom:none}
/* year group header만 필요하므로 thead는 숨기지 않음 */
</style>
</head>
<body>

<h1>📊 소비 데이터 대시보드 <span class="badge">""" + YEAR_MONTH_LABEL + """</span></h1>
<p class="sub">기준월: """ + YEAR_MONTH_LABEL + """ &nbsp;|&nbsp; 비교: """ + PREV_LABEL + """</p>

<!-- KPI -->
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-lbl">추정 총 거래금액</div><div class="kpi-val" id="v-amt"></div><div class="kpi-sub">전년 <span id="v-amt-bf"></span></div><div class="kpi-yoy" id="v-amt-yoy"></div></div>
  <div class="kpi"><div class="kpi-lbl">추정 총 거래건수</div><div class="kpi-val" id="v-cnt"></div><div class="kpi-sub">전년 <span id="v-cnt-bf"></span></div><div class="kpi-yoy" id="v-cnt-yoy"></div></div>
  <div class="kpi"><div class="kpi-lbl">건당 평균 거래금액</div><div class="kpi-val" id="v-atv"></div><div class="kpi-sub">전년 <span id="v-atv-bf"></span></div><div class="kpi-yoy" id="v-atv-yoy"></div></div>
</div>

<!-- 공휴일 현황 + 주차별 그래프 -->
<div class="g2" style="grid-template-columns:35% 65%; align-items:start">
  <div class="card" style="margin-bottom:0">
    <h2>🎌 주차별 공휴일 현황</h2>
    <table class="hol-table">
      <thead>
        <tr>
          <th style="width:52px"></th>
          <th class="year-col" id="hol-prev-head" colspan="2" style="text-align:center"></th>
          <th class="year-col" id="hol-cur-head" colspan="2" style="text-align:center"></th>
        </tr>
      </thead>
      <tbody id="holTbody"></tbody>
    </table>
  </div>
  <div class="card" style="margin-bottom:0">
    <h2>📅 주차별 비교</h2>
    <div class="tabs" id="wdnTabs">
      <button class="tab on" onclick="swWdn('amt',this)">거래금액</button>
      <button class="tab" onclick="swWdn('daily',this)">일평균 금액</button>
    </div>
    <div class="cw" style="height:300px"><canvas id="cWdn"></canvas></div>
    <div class="winfo" id="winfo"></div>
  </div>
</div>
<div style="margin-bottom:20px"></div>

<!-- 업종 Top30 -->
<div class="card">
  <h2>🏪 업종별 거래금액 Top 30</h2>
  <div class="tabs" id="ryTabs">
    <button class="tab on" onclick="swRy('amt',this)">거래금액 (내림차순)</button>
    <button class="tab" onclick="swRy('yoy',this)">YoY % (오름차순 →)</button>
  </div>
  <div class="cw" style="height:380px"><canvas id="cRy"></canvas></div>
</div>

<!-- 지역 -->
<div class="card">
  <h2>🗺️ 지역별 거래금액</h2>
  <div class="tabs" id="ctyTabs">
    <button class="tab on" onclick="swCty('amt',this)">거래금액 (내림차순)</button>
    <button class="tab" onclick="swCty('yoy',this)">YoY % (오름차순 →)</button>
  </div>
  <div class="cw" style="height:320px"><canvas id="cCty"></canvas></div>
</div>

<!-- 연령대 -->
<div class="card">
  <h2>👤 연령대별 거래금액 &amp; YoY</h2>
  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
    <div class="tabs" id="ageGrpTabs">
      <button class="tab on" onclick="swAgeGrp('5',this)">5세 단위</button>
      <button class="tab" onclick="swAgeGrp('10',this)">10세 단위</button>
    </div>
    <div class="tabs" id="ageSexTabs">
      <button class="tab on" onclick="swAgeSex('total',this)">전체</button>
      <button class="tab" onclick="swAgeSex('male',this)">남</button>
      <button class="tab" onclick="swAgeSex('female',this)">여</button>
    </div>
  </div>
  <div class="cw" style="height:300px"><canvas id="cAge"></canvas></div>
</div>

<!-- 시간대별: 전체 가로 -->
<div class="card">
  <h2>🕐 시간대별 거래금액</h2>
  <div class="cw" style="height:280px"><canvas id="cTm"></canvas></div>
</div>

<!-- 업종 YoY 테이블 -->
<div class="card">
  <h2>📋 업종별 YoY 상세 <span style="font-size:.78rem;color:var(--muted);font-weight:400">— 컬럼 클릭 정렬</span></h2>
  <div class="tbl-wrap">
    <table id="ryTable">
      <thead><tr>
        <th onclick="sortTable(0,'str')">업종<span class="sort-icon"></span></th>
        <th onclick="sortTable(1,'num')">당월 금액<span class="sort-icon"></span></th>
        <th onclick="sortTable(2,'num')">전년 금액<span class="sort-icon"></span></th>
        <th onclick="sortTable(3,'num')">금액 YoY<span class="sort-icon"></span></th>
        <th onclick="sortTable(4,'num')">건수 YoY<span class="sort-icon"></span></th>
        <th onclick="sortTable(5,'num')">결제단가(당월)<span class="sort-icon"></span></th>
        <th onclick="sortTable(6,'num')">결제단가(전년)<span class="sort-icon"></span></th>
        <th onclick="sortTable(7,'num')">단가 YoY<span class="sort-icon"></span></th>
      </tr></thead>
      <tbody id="ryTbody"></tbody>
    </table>
  </div>
</div>

<script>
const KPI=""" + kpi_j + """;
const RY=""" + ry_j + """;
const CTY=""" + cty_j + """;
const WDN=""" + wdn_j + """;
const HOL=""" + hol_j + """;
const TM=""" + tm_j + """;
const AGE=""" + age_j + """;
const TBL=""" + tbl_j + """;
const CTY_FLOW=""" + cty_flow_j + """;

Chart.defaults.color='#94a3b8';
Chart.defaults.borderColor='#2a2d3e';
const CA='rgba(79,142,247,0.85)',CB='rgba(100,116,139,0.7)';
const CP='rgba(52,211,153,0.85)',CN='rgba(248,113,113,0.85)',CL='#f59e0b';

function yoySpan(v){if(v==null||v===undefined||Number.isNaN(v))return '-'; const n=Number(v); return `<span class="${n>=0?'pos':'neg'}">${n>=0?'+':''}${n.toFixed(2)}%</span>`;}
document.getElementById('v-amt').textContent=Math.round(KPI.total_amt).toLocaleString()+'억원';
document.getElementById('v-amt-bf').textContent=Math.round(KPI.total_amt_bf).toLocaleString()+'억원';
document.getElementById('v-amt-yoy').innerHTML='YoY '+yoySpan(KPI.yoy_amt);
document.getElementById('v-cnt').textContent=Math.round(KPI.total_cnt).toLocaleString()+'만건';
document.getElementById('v-cnt-bf').textContent=Math.round(KPI.total_cnt_bf).toLocaleString()+'만건';
document.getElementById('v-cnt-yoy').innerHTML='YoY '+yoySpan(KPI.yoy_cnt);
const atv=KPI.total_cnt>0?Math.round(KPI.total_amt/KPI.total_cnt*1e4):0;
const atv_bf=KPI.total_cnt_bf>0?Math.round(KPI.total_amt_bf/KPI.total_cnt_bf*1e4):0;
const atv_yoy=atv_bf>0?parseFloat(((atv-atv_bf)/atv_bf*100).toFixed(2)):null;
document.getElementById('v-atv').textContent=atv.toLocaleString()+'원';
document.getElementById('v-atv-bf').textContent=atv_bf.toLocaleString()+'원';
document.getElementById('v-atv-yoy').innerHTML='YoY '+yoySpan(atv_yoy);

/* ── 공휴일 테이블 렌더링 ── */
(function renderHol(){
  // 헤더(전년/올해)는 "전년(YYYY-MM) / 올해(YYYY-MM)" 형태로 표시
  document.getElementById('hol-cur-head').textContent  = `올해 (${HOL.cur_year}-${String(HOL.cur_month).padStart(2,'0')})`;
  document.getElementById('hol-prev-head').textContent = `전년 (${HOL.prev_year}-${String(HOL.prev_month).padStart(2,'0')})`;
  const tbody = document.getElementById('holTbody');
  HOL.weeks.forEach((w, wi) => {
    // 범위 행 + 공휴일 행 계산
    const maxRows = Math.max(1, w.cur_holidays.length, w.prev_holidays.length);
    for(let i=0; i<maxRows; i++){
      const tr = document.createElement('tr');
      if(i === 0 && wi > 0) tr.classList.add('week-sep');
      // 주차 셀 (첫 행만, rowspan)
      if(i === 0){
        const td = document.createElement('td');
        td.className = 'wdn-col';
        td.rowSpan = maxRows;
        td.textContent = `${w.wdn}주차`;
        tr.appendChild(td);
      }

      // 컬럼 순서: 전년(일자) / 전년(공휴일) / 올해(일자) / 올해(공휴일)
      // 1) 전년 일자(주차 범위)
      const tdPrevDate = document.createElement('td');
      tdPrevDate.className = 'hol-date-cell prev-date-col';
      if(i === 0){
        const span = document.createElement('span');
        span.className = 'range-col';
        span.textContent = w.prev_range;
        tdPrevDate.appendChild(span);
      }
      tr.appendChild(tdPrevDate);

      // 2) 전년 공휴일(공휴일명 (MM/DD))
      const tdPrevHol = document.createElement('td');
      tdPrevHol.className = 'hol-hol-cell prev-hol-col';
      if(i < w.prev_holidays.length){
        const raw = String(w.prev_holidays[i] ?? '');
        const sp = raw.indexOf(' ');
        if(sp > 0){
          const date = raw.slice(0, sp);
          const name = raw.slice(sp + 1);
          tdPrevHol.textContent = `${name} (${date})`;
        }else{
          tdPrevHol.textContent = raw;
        }
      }
      tr.appendChild(tdPrevHol);

      // 3) 올해 일자(주차 범위)
      const tdCurDate = document.createElement('td');
      tdCurDate.className = 'hol-date-cell cur-date-col';
      if(i === 0){
        const span = document.createElement('span');
        span.className = 'range-col';
        span.textContent = w.cur_range;
        tdCurDate.appendChild(span);
      }
      tr.appendChild(tdCurDate);

      // 4) 올해 공휴일(공휴일명 (MM/DD))
      const tdCurHol = document.createElement('td');
      tdCurHol.className = 'hol-hol-cell cur-hol-col';
      if(i < w.cur_holidays.length){
        const raw = String(w.cur_holidays[i] ?? '');
        const sp = raw.indexOf(' ');
        if(sp > 0){
          const date = raw.slice(0, sp);
          const name = raw.slice(sp + 1);
          tdCurHol.textContent = `${name} (${date})`;
        }else{
          tdCurHol.textContent = raw;
        }
      }
      tr.appendChild(tdCurHol);

      tbody.appendChild(tr);
    }
  });
})();

function barOpts(ySuffix){return{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{position:'top',labels:{boxWidth:12,padding:10}}},
  scales:{x:{ticks:{maxRotation:40,minRotation:0}},y:{ticks:{callback:v=>Math.round(v)+ySuffix}}}};}
function yoyBarOpts(rotX){return{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{position:'top',labels:{boxWidth:12,padding:10}}},
  scales:{x:{ticks:{maxRotation:rotX||40,minRotation:0}},y:{ticks:{callback:v=>Number(v).toFixed(2)+'%'}}}};}
function dualOpts(){return{responsive:true,maintainAspectRatio:false,
  plugins:{legend:{position:'top',labels:{boxWidth:12,padding:10}}},
  scales:{x:{ticks:{maxRotation:0}},
    yL:{position:'left',ticks:{callback:v=>Math.round(v)+'억'}},
    yR:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:v=>Number(v).toFixed(2)+'%'}}}};}
function lineDs(arr){return{type:'line',label:'YoY %',data:arr,
  borderColor:CL,backgroundColor:'rgba(245,158,11,0.08)',
  pointBackgroundColor:arr.map(v=>v>=0?'#34d399':'#f87171'),
  pointRadius:7,pointHoverRadius:9,borderWidth:2.5,tension:0.3,fill:false,yAxisID:'yR'};}

Chart.register({id:'zeroLine',afterDraw(chart){
  const y2=chart.scales['yR']; if(!y2) return;
  const y0=y2.getPixelForValue(0);
  if(y0<y2.top||y0>y2.bottom) return;
  const ctx=chart.ctx; ctx.save();
  ctx.beginPath(); ctx.moveTo(chart.chartArea.left,y0); ctx.lineTo(chart.chartArea.right,y0);
  ctx.strokeStyle='rgba(245,158,11,0.55)'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]);
  ctx.stroke(); ctx.restore();
}});

let ryChart;
function swRy(m,el){
  document.querySelectorAll('#ryTabs .tab').forEach(t=>t.classList.remove('on')); el.classList.add('on');
  if(ryChart) ryChart.destroy();
  ryChart=m==='yoy'
    ?new Chart(document.getElementById('cRy'),{type:'bar',data:{labels:RY.yoy_labels,datasets:[{label:'YoY %',data:RY.yoy_vals,backgroundColor:RY.yoy_vals.map(v=>v>=0?CP:CN),borderRadius:4}]},options:yoyBarOpts(40)})
    :new Chart(document.getElementById('cRy'),{type:'bar',data:{labels:RY.amt_labels,datasets:[{label:'당월',data:RY.amt_current,backgroundColor:CA,borderRadius:4},{label:'전년',data:RY.amt_prev,backgroundColor:CB,borderRadius:4}]},options:barOpts('억')});
}

let ctyChart;
function swCty(m,el){
  document.querySelectorAll('#ctyTabs .tab').forEach(t=>t.classList.remove('on')); el.classList.add('on');
  if(ctyChart) ctyChart.destroy();
  ctyChart=m==='yoy'
    ?new Chart(document.getElementById('cCty'),{type:'bar',data:{labels:CTY.yoy_labels,datasets:[{label:'YoY %',data:CTY.yoy_vals,backgroundColor:CTY.yoy_vals.map(v=>v>=0?CP:CN),borderRadius:4}]},options:yoyBarOpts(0)})
    :new Chart(document.getElementById('cCty'),{type:'bar',data:{labels:CTY.amt_labels,datasets:[{label:'당월',data:CTY.amt_current,backgroundColor:CA,borderRadius:4},{label:'전년',data:CTY.amt_prev,backgroundColor:CB,borderRadius:4}]},options:barOpts('억')});
}

let wdnChart;
function swWdn(m,el){
  document.querySelectorAll('#wdnTabs .tab').forEach(t=>t.classList.remove('on')); el.classList.add('on');
  if(wdnChart) wdnChart.destroy();
  const isD=(m==='daily');
  const cur=isD?WDN.daily:WDN.current, prev=isD?WDN.daily_bf:WDN.prev;
  const yoy=isD?WDN.yoy_daily:WDN.yoy, lbl=isD?'일평균':'거래금액';
  wdnChart=new Chart(document.getElementById('cWdn'),{type:'bar',data:{labels:WDN.cur_labels,datasets:[
    {type:'bar',label:'당월 '+lbl,data:cur,backgroundColor:CA,borderRadius:4,yAxisID:'yL'},
    {type:'bar',label:'전년 '+lbl,data:prev,backgroundColor:CB,borderRadius:4,yAxisID:'yL'},
    lineDs(yoy)
  ]},options:dualOpts()});
  document.getElementById('winfo').innerHTML='📅 포함 일수 | '+
    WDN.cur_labels.map((l,i)=>`<b>${WDN.wdn_keys[i]}주차</b>: 당월 ${WDN.dy_cnt[i]}일 · 전년 ${WDN.dy_cnt_bf[i]}일`).join(' &nbsp;·&nbsp; ');
}

new Chart(document.getElementById('cTm'),{type:'bar',data:{labels:TM.labels,datasets:[
  {label:'당월',data:TM.current,backgroundColor:CA,borderRadius:4},
  {label:'전년',data:TM.prev,backgroundColor:CB,borderRadius:4}
]},options:barOpts('억')});

let ageChart, ageGrp='5', ageSex='total';
function renderAge(){
  if(ageChart) ageChart.destroy();
  const s10=(ageGrp==='10'?'10':'');
  const pfx=(ageSex==='total'?'':ageSex+'_');
  const labels=ageGrp==='10'?AGE.labels10:AGE.labels;
  const cur=AGE[pfx+'current'+s10], prev=AGE[pfx+'prev'+s10], yoy=AGE[pfx+'yoy'+s10];
  ageChart=new Chart(document.getElementById('cAge'),{type:'bar',data:{labels,datasets:[
    {type:'bar',label:'당월',data:cur,backgroundColor:CA,borderRadius:4,yAxisID:'yL'},
    {type:'bar',label:'전년',data:prev,backgroundColor:CB,borderRadius:4,yAxisID:'yL'},
    lineDs(yoy)
  ]},options:dualOpts()});
}
function swAgeGrp(m,el){
  document.querySelectorAll('#ageGrpTabs .tab').forEach(t=>t.classList.remove('on')); el.classList.add('on');
  ageGrp=m; renderAge();
}
function swAgeSex(m,el){
  document.querySelectorAll('#ageSexTabs .tab').forEach(t=>t.classList.remove('on')); el.classList.add('on');
  ageSex=m; renderAge();
}
renderAge();

swRy('amt',  document.querySelector('#ryTabs  .tab.on'));
swCty('amt', document.querySelector('#ctyTabs .tab.on'));
swWdn('amt', document.querySelector('#wdnTabs .tab.on'));

let sortCol=-1, sortAsc=true;
function pct(v){if(v==null||v===undefined||Number.isNaN(v))return '-'; const n=Number(v); return `<span class="${n>=0?'pos':'neg'}">${n>=0?'+':''}${n.toFixed(2)}%</span>`;}
function won(v){return v==null?'-':Math.round(v).toLocaleString()+'원';}
function renderTable(data){
  document.getElementById('ryTbody').innerHTML=data.map(r=>`<tr>
    <td>${r.ry_nm}</td><td>${r.est_amt}억</td><td>${r.est_amt_bf}억</td>
    <td>${pct(r.yoy_amt_pct)}</td><td>${pct(r.yoy_cnt_pct)}</td>
    <td>${won(r.atv)}</td><td>${won(r.atv_bf)}</td><td>${pct(r.yoy_atv_pct)}</td>
  </tr>`).join('');
}
function sortTable(col,type){
  const ths=document.querySelectorAll('#ryTable thead th');
  sortAsc=(sortCol===col)?!sortAsc:false; sortCol=col;
  ths.forEach((th,i)=>{th.classList.remove('sort-asc','sort-desc'); if(i===col) th.classList.add(sortAsc?'sort-asc':'sort-desc');});
  const keys=['ry_nm','est_amt','est_amt_bf','yoy_amt_pct','yoy_cnt_pct','atv','atv_bf','yoy_atv_pct'];
  const k=keys[col];
  const sorted=[...TBL].sort((a,b)=>{
    const va=a[k],vb=b[k];
    if(va==null&&vb==null) return 0; if(va==null) return 1; if(vb==null) return -1;
    return type==='str'?(sortAsc?va.localeCompare(vb,'ko'):vb.localeCompare(va,'ko')):(sortAsc?va-vb:vb-va);
  });
  renderTable(sorted);
}
sortTable(3,'num');

</script>
</body></html>"""


# ── 메인 ─────────────────────────────────────
def main():
    print("=" * 50)
    print(f"대시보드 생성: {YEAR_MONTH_LABEL} vs {PREV_LABEL}")
    print("=" * 50)

    # 선행 파이프라인에서 생성된 report_payload.json을 사용
    ym = f"{TARGET_YEAR}{TARGET_MONTH:02d}"
    payload_path = os.path.join(os.path.dirname(__file__), "artifacts", "reports", ym, "report_payload.json")
    if not os.path.exists(payload_path):
        raise FileNotFoundError(f"report_payload.json을 찾을 수 없습니다. 먼저 metrics_builder.py를 실행하세요: {payload_path}")

    with open(payload_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    meta = payload.get("meta", {})
    dashboard = payload.get("dashboard", {})

    # 공휴일 테이블 데이터는 meta.holiday_weeks와 meta의 연/월로 재구성
    hol = {
        "cur_year": meta.get("target_year"),
        "cur_month": meta.get("target_month"),
        "prev_year": meta.get("prev_year"),
        "prev_month": meta.get("prev_month"),
        "weeks": meta.get("holiday_weeks", []),
    }
    hol_j = _jdumps(hol)

    kpi_j = _jdumps(dashboard.get("kpi", {}))
    ry_j = _jdumps(dashboard.get("ry", {}))
    cty_j = _jdumps(dashboard.get("cty", {}))
    wdn_j = _jdumps(dashboard.get("wdn", {}))
    tm_j = _jdumps(dashboard.get("tm", {}))
    age_j = _jdumps(dashboard.get("age", {}))
    tbl_j = _jdumps(dashboard.get("tbl", []))
    cty_flow_j = _jdumps(dashboard.get("cty_flow", []))

    print("HTML 생성 중...")
    html = build_html(kpi_j, ry_j, cty_j, wdn_j, tm_j, age_j, hol_j, tbl_j, cty_flow_j)
    out_path = os.path.join(DATA_DIR, OUTPUT_FILE)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"\n완료 → {out_path}")


if __name__ == "__main__":
    main()