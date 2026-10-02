import json
import os
from datetime import datetime

import sys

import pandas as pd

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import dashboard_generator as dg


def _safe_float(v):
    try:
        fv = float(v)
        if fv != fv:
            return None
        return fv
    except Exception:
        return None


def _ukw(value):
    number = _safe_float(value)
    return int(round(number / 1e8)) if number is not None else 0


def _cross_series(frame, label_col, labels):
    lookup = {}
    for _, row in frame.iterrows():
        lookup[str(row[label_col])] = row
    current, prev, yoy = [], [], []
    for label in labels:
        row = lookup.get(str(label))
        if row is None:
            current.append(0)
            prev.append(0)
            yoy.append(0)
            continue
        current.append(_ukw(row["est_amt"]))
        prev.append(_ukw(row["est_amt_bf"]))
        yoy.append(dg.safe_val(row["yoy_amt_pct"]) or 0)
    return {"labels": [str(label) for label in labels], "current": current, "prev": prev, "yoy": yoy}


def _industry_cross(df, by_ry, by_wdn):
    """업종별 화면용. 업로드 집계 때 한 번만 만들고, 페이지는 이 숫자만 읽는다."""
    week_labels = [dg._default_wdn_label(str(value)) for value in by_wdn["wdn"].tolist()]
    by_ry_wdn = dg.agg_by(df, ["ry_nm", "wdn"])
    age_base = df.assign(_age10=df["age_gp"].map(dg.AGE10_MAP))
    age_base = age_base[age_base["_age10"].notna()]
    by_ry_age = dg.agg_by(age_base, ["ry_nm", "_age10"]) if len(age_base) else pd.DataFrame(columns=["ry_nm", "_age10", "est_amt"])
    sex_base = age_base[age_base["sex_ccd"].isin(["M", "F"])] if len(age_base) else age_base
    by_ry_age_sex = dg.agg_by(sex_base, ["ry_nm", "_age10", "sex_ccd"]) if len(sex_base) else pd.DataFrame(columns=["ry_nm", "_age10", "sex_ccd", "est_amt"])
    region_base = df[df["cty_nm"] != "미확인"]
    by_ry_cty = dg.agg_by(region_base, ["ry_nm", "cty_nm"]) if len(region_base) else pd.DataFrame(columns=["ry_nm", "cty_nm", "est_amt"])
    by_ry_tm = dg.agg_by(df, ["ry_nm", "trns_tm_gp"])
    zeros = {"labels": list(dg.AGE10_ORDER), "current": [0] * len(dg.AGE10_ORDER), "prev": [0] * len(dg.AGE10_ORDER), "yoy": [0] * len(dg.AGE10_ORDER)}

    def _time_label(value):
        text = str(value)
        return text.split("_", 1)[1] if "_" in text else text

    def _part(frame, name):
        if frame is None or len(frame) == 0 or "ry_nm" not in frame.columns:
            return frame.iloc[0:0] if frame is not None else pd.DataFrame()
        return frame[frame["ry_nm"].astype(str) == name]

    items = {}
    for _, row in by_ry.iterrows():
        name = str(row["ry_nm"])
        weeks = _part(by_ry_wdn, name).copy()
        if len(weeks):
            weeks["_label"] = weeks["wdn"].map(lambda value: dg._default_wdn_label(str(value)))
        ages = _part(by_ry_age, name)
        sex_rows = _part(by_ry_age_sex, name)
        males = sex_rows[sex_rows["sex_ccd"].astype(str) == "M"] if len(sex_rows) and "sex_ccd" in sex_rows.columns else sex_rows.iloc[0:0]
        females = sex_rows[sex_rows["sex_ccd"].astype(str) == "F"] if len(sex_rows) and "sex_ccd" in sex_rows.columns else sex_rows.iloc[0:0]
        regions = _part(by_ry_cty, name)
        times = _part(by_ry_tm, name).copy()
        if len(times):
            times["_label"] = times["trns_tm_gp"].map(_time_label)
        time_order = [str(value) for value in times.sort_values("trns_tm_gp")["_label"].tolist()] if len(times) else []
        region_order = [str(value) for value in regions.sort_values("est_amt", ascending=False)["cty_nm"].tolist()] if len(regions) else []
        atv = _safe_float(row.get("atv"))
        atv_bf = _safe_float(row.get("atv_bf"))
        items[name] = {
            "kpi": {
                "total_amt": _ukw(row["est_amt"]),
                "total_amt_bf": _ukw(row["est_amt_bf"]),
                "yoy_amt": dg.safe_val(row["yoy_amt_pct"]) or 0,
                "total_cnt": round((_safe_float(row["est_cnt"]) or 0) / 1e4, 2),
                "total_cnt_bf": round((_safe_float(row["est_cnt_bf"]) or 0) / 1e4, 2),
                "yoy_cnt": dg.safe_val(row["yoy_cnt_pct"]) or 0,
                "atv": int(round(atv)) if atv is not None else None,
                "atv_bf": int(round(atv_bf)) if atv_bf is not None else None,
                "yoy_atv": dg.safe_val(row.get("yoy_atv_pct")),
            },
            "wdn": _cross_series(weeks, "_label", week_labels) if len(weeks) else {"labels": week_labels, "current": [0] * len(week_labels), "prev": [0] * len(week_labels), "yoy": [0] * len(week_labels)},
            "age": _cross_series(ages, "_age10", dg.AGE10_ORDER) if len(ages) else zeros,
            "age_sex": {
                "labels": list(dg.AGE10_ORDER),
                "male": _cross_series(males, "_age10", dg.AGE10_ORDER),
                "female": _cross_series(females, "_age10", dg.AGE10_ORDER),
            },
            "cty": _cross_series(regions, "cty_nm", region_order),
            "tm": _cross_series(times, "_label", time_order) if len(times) else {"labels": [], "current": [], "prev": [], "yoy": []},
        }
    return items


def _top_changes(df, label_col, metric_col, top_n=5, ascending=False):
    ordered = df.sort_values(metric_col, ascending=ascending).head(top_n)
    rows = []
    for _, r in ordered.iterrows():
        label = str(r[label_col])
        val = _safe_float(r[metric_col])
        rows.append(
            {
                "label": label,
                "value": round(val, 2) if val is not None else None,
                "source_key": f"{label_col}.{label}.{metric_col}",
            }
        )
    return rows


def _atv_change_won(r):
    atv = _safe_float(r.get("atv"))
    atv_bf = _safe_float(r.get("atv_bf"))
    if atv is None or atv_bf is None:
        return None
    return int(round(atv - atv_bf))


def _atv_prev_curr_change(r):
    atv = _safe_float(r.get("atv"))
    atv_bf = _safe_float(r.get("atv_bf"))
    if atv is None or atv_bf is None:
        return None, None, None
    prev_won = int(round(atv_bf))
    curr_won = int(round(atv))
    return prev_won, curr_won, int(round(atv - atv_bf))


def _apply_filters(df, filters):
    """LLM extra_metric_requests용 간단한 필터 적용: *_eq, *_in 만 지원."""
    if not filters:
        return df
    mask = None
    for key, val in filters.items():
        if key.endswith("_eq"):
            col = key[:-3]
            m = df[col] == val
        elif key.endswith("_in"):
            col = key[:-3]
            m = df[col].isin(val)
        else:
            # 알 수 없는 필터 키는 무시
            continue
        mask = m if mask is None else (mask & m)
    return df if mask is None else df[mask]


def llm_extra_metrics(df, requests):
    """
    LLM이 제안한 extra_metric_requests(JSON)를 기반으로,
    이미 로드된 df 위에서 추가 집계를 수행한다.

    request 스키마(요약):
      {
        "id": "week_age10_industry_kids_it",
        "dimensions": ["wdn","age10","ry_nm"],
        "filters": { "ry_nm_in": [...], "cty_nm_eq": "서울", ... },
        "metrics": ["amt_ukw","yoy_amt_pct","atv_prev_won","atv_curr_won","atv_change_won"],
        "description": "...",
        "reason": "..."
      }

    반환값:
      { id: { "description": ..., "reason": ..., "rows": [ {dim..., metric...}, ... ] }, ... }
    """
    results = {}
    if not requests:
        return results

    # age10이 필요한지 미리 확인 (루프 전에 1회만 파생)
    need_age10_any = False
    for req in requests:
        dims = req.get("dimensions") or []
        filters = req.get("filters") or {}
        if "age10" in dims or any(k.startswith("age10_") for k in filters.keys()):
            need_age10_any = True
            break

    # age10 파생을 루프 전에 1회만 수행
    base_df = df
    if need_age10_any and "age10" not in base_df.columns:
        base_df = df.assign(age10=df["age_gp"].map(dg.AGE10_MAP))

    for req in requests:
        rid = req.get("id") or "unnamed"
        dims = req.get("dimensions") or []
        filters = req.get("filters") or []
        metrics = req.get("metrics") or []

        df_f = _apply_filters(base_df, filters)
        if not dims:
            # dimensions가 없으면 전체 합계 한 줄로 보고
            g = dg.agg_by(df_f, [])
        else:
            g = dg.agg_by(df_f, dims)

        rows = []
        for _, r in g.iterrows():
            row = {}
            # dimension 값 복사
            for d in dims:
                row[d] = r[d]

            # 규모 계열
            if "amt_ukw" in metrics:
                row["amt_ukw"] = int(round(float(r["est_amt"]) / 1e8))
            if "amt_bf_ukw" in metrics and "est_amt_bf" in r:
                row["amt_bf_ukw"] = int(round(float(r["est_amt_bf"]) / 1e8))

            # YoY 계열
            if "yoy_amt_pct" in metrics:
                row["yoy_amt_pct"] = dg.safe_val(r.get("yoy_amt_pct"))
            if "yoy_cnt_pct" in metrics:
                row["yoy_cnt_pct"] = dg.safe_val(r.get("yoy_cnt_pct"))
            if "yoy_daily_pct" in metrics:
                row["yoy_daily_pct"] = dg.safe_val(r.get("yoy_daily_pct"))
            if "yoy_atv_pct" in metrics:
                row["yoy_atv_pct"] = dg.safe_val(r.get("yoy_atv_pct"))

            # 단가 계열
            if any(m.startswith("atv_") for m in metrics):
                prev_won, curr_won, diff_won = _atv_prev_curr_change(r)
                if "atv_prev_won" in metrics:
                    row["atv_prev_won"] = prev_won
                if "atv_curr_won" in metrics:
                    row["atv_curr_won"] = curr_won
                if "atv_change_won" in metrics:
                    row["atv_change_won"] = diff_won
                if "atv_transition_won" in metrics:
                    row["atv_transition_won"] = (
                        f"{prev_won}->{curr_won}" if prev_won is not None and curr_won is not None else None
                    )

            rows.append(row)

        results[rid] = {
            "description": req.get("description"),
            "reason": req.get("reason"),
            "dimensions": dims,
            "filters": filters,
            "metrics": metrics,
            "rows": rows,
        }

    return results

def compute_core_metrics():
    cur_holiday_labels, prev_holiday_labels = dg._load_holiday_labels()
    hol = dg._load_holiday_week_table(cur_holiday_labels, prev_holiday_labels)
    df = dg.preprocess(dg.load_all_chunks())

    by_ry = dg.agg_by(df, ["ry_nm"])
    by_cty = dg.agg_by(df, ["cty_nm"])
    by_wdn = dg.agg_by(df, ["wdn"], sort="wdn")
    by_tm = dg.agg_by(df, ["trns_tm_gp"], sort="trns_tm_gp")
    by_age = dg.agg_by(df, ["age_gp"], sort="age_gp")
    by_age_m = dg.agg_by(df[df["sex_ccd"] == "M"], ["age_gp"], sort="age_gp")
    by_age_f = dg.agg_by(df[df["sex_ccd"] == "F"], ["age_gp"], sort="age_gp")
    by_age10 = dg._agg_age10(df)
    by_age10_m = dg._agg_age10(df[df["sex_ccd"] == "M"])
    by_age10_f = dg._agg_age10(df[df["sex_ccd"] == "F"])
    by_cty_ry = dg.agg_by(df, ["cty_nm", "ry_nm"])
    by_ry_sub = dg.agg_by(df, ["ry_nm", "hpsn_ry_sl_cz_nm"])
    by_cty_dist = dg.agg_by(df, ["cty_nm", "dist_type"])

    total_amt = float(df["est_amt"].sum())
    total_amt_bf = float(df["est_amt_bf"].sum())
    total_cnt = float(df["est_cnt"].sum())
    total_cnt_bf = float(df["est_cnt_bf"].sum())

    kpi = {
        "total_amt_ukw": int(round(total_amt / 1e8)),
        "total_amt_bf_ukw": int(round(total_amt_bf / 1e8)),
        "yoy_amt_pct": round((total_amt - total_amt_bf) / total_amt_bf * 100, 2) if total_amt_bf > 0 else 0,
        "total_cnt_10k": int(round(total_cnt / 1e4)),
        "total_cnt_bf_10k": int(round(total_cnt_bf / 1e4)),
        "yoy_cnt_pct": round((total_cnt - total_cnt_bf) / total_cnt_bf * 100, 2) if total_cnt_bf > 0 else 0,
    }

    return {
        "df": df,
        "hol": hol,
        "kpi": kpi,
        "by_ry": by_ry,
        "by_cty": by_cty,
        "by_wdn": by_wdn,
        "by_tm": by_tm,
        "by_age": by_age,
        "by_age_m": by_age_m,
        "by_age_f": by_age_f,
        "by_age10": by_age10,
        "by_age10_m": by_age10_m,
        "by_age10_f": by_age10_f,
        "by_cty_ry": by_cty_ry,
        "by_ry_sub": by_ry_sub,
        "by_cty_dist": by_cty_dist,
    }


def build_report_payload():
    metrics = compute_core_metrics()
    df = metrics["df"]
    hol = metrics["hol"]
    kpi = metrics["kpi"]
    by_ry = metrics["by_ry"]
    by_cty = metrics["by_cty"]
    by_wdn = metrics["by_wdn"]
    by_tm = metrics["by_tm"]
    by_age = metrics["by_age"]
    by_age_m = metrics["by_age_m"]
    by_age_f = metrics["by_age_f"]
    by_age10 = metrics["by_age10"]
    by_age10_m = metrics["by_age10_m"]
    by_age10_f = metrics["by_age10_f"]
    by_cty_ry = metrics["by_cty_ry"]
    by_ry_sub = metrics["by_ry_sub"]
    by_cty_dist = metrics["by_cty_dist"]
    # age_gp -> age10으로 매핑한 뒤 업종 교차 집계
    age_ind = df.assign(_age10=df["age_gp"].map(dg.AGE10_MAP))
    age_ind = age_ind[age_ind["_age10"].notna()]
    by_age10_ry = dg.agg_by(age_ind, ["_age10", "ry_nm"])

    # 전처리 완료된 DF를 재사용할 수 있도록 parquet로도 저장해 둔다.
    ym = f"{dg.TARGET_YEAR}{dg.TARGET_MONTH:02d}"
    df_out_dir = os.path.join("artifacts", "reports", ym)
    os.makedirs(df_out_dir, exist_ok=True)
    df_parquet_path = os.path.join(df_out_dir, "core_df.parquet")
    try:
        df.to_parquet(df_parquet_path, index=False)
        print(f"core df saved for reuse: {df_parquet_path}")
    except Exception as e:
        # parquet 저장 실패해도 전체 파이프라인은 계속 진행
        print(f"[WARN] failed to save core df parquet ({df_parquet_path}): {e}")

    fixed_metrics = {
        "kpi": kpi,
        "industry_top10_amt": [
            {
                "label": str(r["ry_nm"]),
                "amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "source_key": f"ry_nm.{r['ry_nm']}.est_amt",
            }
            for _, r in by_ry.sort_values("est_amt", ascending=False).head(10).iterrows()
        ],
        "region_top10_amt": [
            {
                "label": str(r["cty_nm"]),
                "amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "source_key": f"cty_nm.{r['cty_nm']}.est_amt",
            }
            for _, r in by_cty.sort_values("est_amt", ascending=False).head(10).iterrows()
        ],
        "week_summary": [
            {
                "wdn": str(r["wdn"]),
                "amt_ukw": int(round(_safe_float(r["est_amt"]) or 0 / 1e8)),
                "amt_bf_ukw": int(round(_safe_float(r["est_amt_bf"]) or 0 / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "dy_cnt": int(round(_safe_float(r["dy_cnt"]) or 0)),
                "dy_cnt_bf": int(round(_safe_float(r["dy_cnt_bf"]) or 0)),
                "source_key": f"wdn.{r['wdn']}",
            }
            for _, r in by_wdn.iterrows()
        ],
        "time_summary": [
            {
                "label": str(r["trns_tm_gp"]).split("_", 1)[-1],
                "amt_ukw": int(round((_safe_float(r["est_amt"]) or 0) / 1e8)),
                "source_key": f"trns_tm_gp.{r['trns_tm_gp']}.est_amt",
            }
            for _, r in by_tm.iterrows()
        ],
        "age10_summary": [
            {
                "label": str(r["age10"]),
                "amt_ukw": int(round((_safe_float(r["est_amt"]) or 0) / 1e8)),
                "source_key": f"age10.{r['age10']}.est_amt",
            }
            for _, r in by_age10.iterrows()
        ],
    }

    by_cty_no_unknown = by_cty[by_cty["cty_nm"] != "미확인"].copy()

    # --- llm_context 행 포함 기준(합계 est_amt 기준) ---
    # 기본: 5억 미만 제외 + |YoY| 5% 미만 제외
    # (KPI 등 전사 합계는 별도 필드이며 이 필터를 적용하지 않음)
    _LLM_CTX_MIN_EST_AMT = 5e8
    _LLM_CTX_MIN_ABS_YOY_PCT = 5.0

    def _llm_ctx_mask(df: pd.DataFrame) -> pd.Series:
        yoy = pd.to_numeric(df["yoy_amt_pct"], errors="coerce")
        return (
            (df["est_amt"] >= _LLM_CTX_MIN_EST_AMT)
            & yoy.notna()
            & (yoy.abs() >= _LLM_CTX_MIN_ABS_YOY_PCT)
        )


    _bcr = by_cty_ry[by_cty_ry["cty_nm"] != "미확인"].copy()
    sig_cty_ry = _bcr.loc[_llm_ctx_mask(_bcr)].copy()

    sig_age10_ry = by_age10_ry.loc[_llm_ctx_mask(by_age10_ry)].copy()
    def _is_etc_subcategory(v: object) -> bool:
        return "기타" in str(v or "")

    _ry_sub_base = by_ry_sub[
        ~by_ry_sub["hpsn_ry_sl_cz_nm"].apply(_is_etc_subcategory)
    ].copy()
    sig_ry_sub = _ry_sub_base.loc[_llm_ctx_mask(_ry_sub_base)].copy()

    # 생활밀착업종(고정-3 섹션에서 사용할 코어 업종)의 단가/YoY 정보를
    # initial insights에서도 직접 참고할 수 있도록 별도 블록으로 제공한다.
    living_core = {"식료품/식자재", "음식점/카페", "주유소/연료", "편의점", "대중교통", "의약품/약국"}
    living_core_order = (
        "식료품/식자재",
        "음식점/카페",
        "주유소/연료",
        "편의점",
        "대중교통",
        "의약품/약국",
    )
    living_by_name: dict[str, dict] = {}
    for _, r in by_ry.iterrows():
        name = str(r["ry_nm"])
        if name not in living_core:
            continue
        # LIVING_INDUSTRIES_DETAIL은 5억/5% 임계값을 적용하지 않고 생성한다.
        living_by_name[name] = {
            "industry": name,
            "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
            "est_amt_bf_ukw": int(round(float(r["est_amt_bf"]) / 1e8)),
            "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
            "yoy_cnt_pct": round(_safe_float(r["yoy_cnt_pct"]) or 0, 2),
            "atv": int(round(float(r["atv"]))) if _safe_float(r.get("atv")) is not None else None,
            "atv_bf": int(round(float(r["atv_bf"]))) if _safe_float(r.get("atv_bf")) is not None else None,
            "yoy_atv_pct": round(_safe_float(r.get("yoy_atv_pct")) or 0, 2),
            "atv_prev_won": _atv_prev_curr_change(r)[0],
            "atv_curr_won": _atv_prev_curr_change(r)[1],
            "atv_change_won": _atv_prev_curr_change(r)[2],
            "atv_transition_won": (
                f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                else None
            ),
            "source_key": f"ry_nm.{name}",
        }
    # 생활밀착 코어 업종 전체를 고정 순서로 전달(데이터 없으면 null 채움)
    living_rows = []
    for name in living_core_order:
        if name in living_by_name:
            living_rows.append(living_by_name[name])
        else:
            living_rows.append(
                {
                    "industry": name,
                    "est_amt_ukw": None,
                    "est_amt_bf_ukw": None,
                    "yoy_amt_pct": None,
                    "yoy_cnt_pct": None,
                    "atv": None,
                    "atv_bf": None,
                    "yoy_atv_pct": None,
                    "atv_prev_won": None,
                    "atv_curr_won": None,
                    "atv_change_won": None,
                    "atv_transition_won": None,
                    "source_key": f"ry_nm.{name}",
                }
            )

    def _llm_subcategory_row_from_ry_sub(r) -> dict:
        """ry_nm × 세부업종(hpsn_ry_sl_cz_nm) 집계 행 → llm_context용 dict."""
        return {
            "industry": str(r["ry_nm"]),
            "subcategory": str(r["hpsn_ry_sl_cz_nm"]),
            "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
            "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
            "atv_prev_won": _atv_prev_curr_change(r)[0],
            "atv_curr_won": _atv_prev_curr_change(r)[1],
            "atv_change_won": _atv_prev_curr_change(r)[2],
            "atv_transition_won": (
                f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                if _atv_prev_curr_change(r)[0] is not None
                and _atv_prev_curr_change(r)[1] is not None
                else None
            ),
            "source_key": (
                f"ry_nm.{r['ry_nm']}.hpsn_ry_sl_cz_nm.{r['hpsn_ry_sl_cz_nm']}"
            ),
        }

    top10_rise_ry = (
        by_ry.loc[_llm_ctx_mask(by_ry)]
        .sort_values("yoy_amt_pct", ascending=False)
        .head(10)
    )
    industry_yoy_top_rise_10_subcategory_breakdown = []
    for rank, (_, r_ry) in enumerate(top10_rise_ry.iterrows(), start=1):
        iname = str(r_ry["ry_nm"])
        _sub = by_ry_sub[
            (by_ry_sub["ry_nm"] == iname)
            & (~by_ry_sub["hpsn_ry_sl_cz_nm"].apply(_is_etc_subcategory))
        ]
        sub_df = _sub.loc[_llm_ctx_mask(_sub)].sort_values("est_amt", ascending=False)
        industry_yoy_top_rise_10_subcategory_breakdown.append(
            {
                "rank_in_yoy_rise": rank,
                "industry": iname,
                "parent_yoy_amt_pct": round(_safe_float(r_ry["yoy_amt_pct"]) or 0, 2),
                "parent_est_amt_ukw": int(round(float(r_ry["est_amt"]) / 1e8)),
                "subcategories": [
                    _llm_subcategory_row_from_ry_sub(r) for _, r in sub_df.iterrows()
                ],
            }
        )

    llm_context = {
        "target_year": dg.TARGET_YEAR,
        "target_month": dg.TARGET_MONTH,
        "prev_year": dg.PREV_YEAR,
        "prev_month": dg.PREV_MONTH,
        "kpi": kpi,
        "industry_yoy_top_rise_30": [
            {
                "industry": str(r["ry_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"ry_nm.{r['ry_nm']}",
            }
            for _, r in by_ry.loc[_llm_ctx_mask(by_ry)]
            .sort_values("yoy_amt_pct", ascending=False)
            .head(30)
            .iterrows()
        ],
        "industry_yoy_top_drop_30": [
            {
                "industry": str(r["ry_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"ry_nm.{r['ry_nm']}",
            }
            for _, r in by_ry.loc[_llm_ctx_mask(by_ry)]
            .sort_values("yoy_amt_pct", ascending=True)
            .head(30)
            .iterrows()
        ],
        "weekly_yoy_by_amount": [
            {
                "wdn": str(r["wdn"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "est_amt_bf_ukw": int(round(float(r["est_amt_bf"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "source_key": f"wdn.{r['wdn']}",
            }
            for _, r in by_wdn.iterrows()
        ],
        "region_yoy_top_rise_10_excluding_unknown": [
            {
                "region": str(r["cty_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"cty_nm.{r['cty_nm']}",
            }
            for _, r in by_cty_no_unknown.loc[_llm_ctx_mask(by_cty_no_unknown)]
            .sort_values("yoy_amt_pct", ascending=False)
            .head(10)
            .iterrows()
        ],
        "region_yoy_top_drop_10_excluding_unknown": [
            {
                "region": str(r["cty_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"cty_nm.{r['cty_nm']}",
            }
            for _, r in by_cty_no_unknown.loc[_llm_ctx_mask(by_cty_no_unknown)]
            .sort_values("yoy_amt_pct", ascending=True)
            .head(10)
            .iterrows()
        ],
        "region_dist_type_analysis": [
            {
                "region": str(r["cty_nm"]),
                "dist_type": str(r["dist_type"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "est_amt_bf_ukw": int(round(float(r["est_amt_bf"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "yoy_cnt_pct": round(_safe_float(r["yoy_cnt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"cty_nm.{r['cty_nm']}.dist_type.{r['dist_type']}",
            }
            for _, r in by_cty_dist[(by_cty_dist["cty_nm"] != "미확인")].loc[_llm_ctx_mask(by_cty_dist[(by_cty_dist["cty_nm"] != "미확인")])].iterrows()
        ],
        "region_industry_significant_yoy": [
            {
                "region": str(r["cty_nm"]),
                "industry": str(r["ry_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"cty_nm.{r['cty_nm']}.ry_nm.{r['ry_nm']}",
            }
            for _, r in sig_cty_ry.sort_values("yoy_amt_pct", ascending=False).iterrows()
        ],
        "living_industries_detail": living_rows,
        "age10_industry_significant_yoy": [
            {
                "age10": str(r["_age10"]),
                "industry": str(r["ry_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": f"age10.{r['_age10']}.ry_nm.{r['ry_nm']}",
            }
            for _, r in sig_age10_ry.sort_values("yoy_amt_pct", ascending=False).iterrows()
        ],
        "industry_subcategory_significant_yoy": [
            {
                "industry": str(r["ry_nm"]),
                "subcategory": str(r["hpsn_ry_sl_cz_nm"]),
                "est_amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "yoy_amt_pct": round(_safe_float(r["yoy_amt_pct"]) or 0, 2),
                "atv_prev_won": _atv_prev_curr_change(r)[0],
                "atv_curr_won": _atv_prev_curr_change(r)[1],
                "atv_change_won": _atv_prev_curr_change(r)[2],
                "atv_transition_won": (
                    f"{_atv_prev_curr_change(r)[0]}->{_atv_prev_curr_change(r)[1]}"
                    if _atv_prev_curr_change(r)[0] is not None and _atv_prev_curr_change(r)[1] is not None
                    else None
                ),
                "source_key": (
                    f"ry_nm.{r['ry_nm']}.hpsn_ry_sl_cz_nm.{r['hpsn_ry_sl_cz_nm']}"
                ),
            }
            for _, r in sig_ry_sub.sort_values("yoy_amt_pct", ascending=False).iterrows()
        ],
        "industry_yoy_top_rise_10_subcategory_breakdown": industry_yoy_top_rise_10_subcategory_breakdown,
    }

    # 대시보드용 메트릭 (dashboard_generator와 동일한 구조)
    total_amt_ukw = kpi["total_amt_ukw"]
    total_amt_bf_ukw = kpi["total_amt_bf_ukw"]
    total_cnt_10k = kpi["total_cnt_10k"]
    total_cnt_bf_10k = kpi["total_cnt_bf_10k"]

    kpi_dash = {
        "total_amt": total_amt_ukw,
        "total_amt_bf": total_amt_bf_ukw,
        "yoy_amt": kpi["yoy_amt_pct"],
        "total_cnt": total_cnt_10k,
        "total_cnt_bf": total_cnt_bf_10k,
        "yoy_cnt": kpi["yoy_cnt_pct"],
    }

    # 업종 Top30 / YoY
    top30_amt = by_ry.nlargest(30, "est_amt").sort_values("est_amt", ascending=False)
    top30_yoy = by_ry.nlargest(30, "est_amt").sort_values("yoy_amt_pct", ascending=True)
    ry_dash = {
        "amt_labels": top30_amt["ry_nm"].tolist(),
        "amt_current": ((top30_amt["est_amt"] / 1e8).round(0)).tolist(),
        "amt_prev": ((top30_amt["est_amt_bf"] / 1e8).round(0)).tolist(),
        "yoy_labels": top30_yoy["ry_nm"].tolist(),
        "yoy_vals": top30_yoy["yoy_amt_pct"].round(2).fillna(0).tolist(),
    }

    # 지역 차트용
    cty_amt = by_cty.sort_values("est_amt", ascending=False)
    cty_yoy = by_cty.sort_values("yoy_amt_pct", ascending=True)
    cty_dash = {
        "amt_labels": cty_amt["cty_nm"].tolist(),
        "amt_current": ((cty_amt["est_amt"] / 1e8).round(0)).tolist(),
        "amt_prev": ((cty_amt["est_amt_bf"] / 1e8).round(0)).tolist(),
        "yoy_labels": cty_yoy["cty_nm"].tolist(),
        "yoy_vals": cty_yoy["yoy_amt_pct"].round(2).fillna(0).tolist(),
    }

    # 주차별 차트/툴팁용
    by_wdn_dash = by_wdn.copy()
    by_wdn_dash["cur_label"] = by_wdn_dash["wdn"].apply(dg._default_wdn_label)
    by_wdn_dash["prev_label"] = by_wdn_dash["wdn"].apply(dg._default_wdn_label)
    wdn_dash = {
        "wdn_keys": by_wdn_dash["wdn"].tolist(),
        "cur_labels": by_wdn_dash["cur_label"].tolist(),
        "prev_labels": by_wdn_dash["prev_label"].tolist(),
        "current": ((by_wdn_dash["est_amt"] / 1e8).round(0)).tolist(),
        "prev": ((by_wdn_dash["est_amt_bf"] / 1e8).round(0)).tolist(),
        "daily": ((by_wdn_dash["daily_amt"] / 1e8).round(0)).tolist(),
        "daily_bf": ((by_wdn_dash["daily_amt_bf"] / 1e8).round(0)).tolist(),
        "yoy": by_wdn_dash["yoy_amt_pct"].round(2).fillna(0).tolist(),
        "yoy_daily": by_wdn_dash["yoy_daily_pct"].round(2).fillna(0).tolist(),
        "dy_cnt": by_wdn_dash["dy_cnt"].fillna(0).astype(int).tolist(),
        "dy_cnt_bf": by_wdn_dash["dy_cnt_bf"].fillna(0).astype(int).tolist(),
    }

    # 시간대
    tm_dash = {
        "labels": by_tm["trns_tm_gp"].astype(str).str.extract(r"_(.+)$")[0].tolist(),
        "current": ((by_tm["est_amt"] / 1e8).round(0)).tolist(),
        "prev": ((by_tm["est_amt_bf"] / 1e8).round(0)).tolist(),
    }

    # 연령 (5세 단위 + 10세 단위, 성별 분리 포함)
    _age5_labels = by_age["age_gp"].astype(str).str.extract(r"_(.+)$")[0].tolist()
    age_dash = {
        # 5세 단위
        "labels": _age5_labels,
        "current": ((by_age["est_amt"] / 1e8).round(0)).tolist(),
        "prev": ((by_age["est_amt_bf"] / 1e8).round(0)).tolist(),
        "yoy": by_age["yoy_amt_pct"].round(2).fillna(0).tolist(),
        "male_current": ((by_age_m["est_amt"] / 1e8).round(0)).tolist(),
        "male_prev": ((by_age_m["est_amt_bf"] / 1e8).round(0)).tolist(),
        "male_yoy": by_age_m["yoy_amt_pct"].round(2).fillna(0).tolist(),
        "female_current": ((by_age_f["est_amt"] / 1e8).round(0)).tolist(),
        "female_prev": ((by_age_f["est_amt_bf"] / 1e8).round(0)).tolist(),
        "female_yoy": by_age_f["yoy_amt_pct"].round(2).fillna(0).tolist(),
        # 10세 단위
        "labels10": dg.AGE10_ORDER,
        "current10": ((by_age10["est_amt"] / 1e8).round(0)).tolist(),
        "prev10": ((by_age10["est_amt_bf"] / 1e8).round(0)).tolist(),
        "yoy10": by_age10["yoy_amt_pct"].round(2).fillna(0).tolist(),
        "male_current10": ((by_age10_m["est_amt"] / 1e8).round(0)).tolist(),
        "male_prev10": ((by_age10_m["est_amt_bf"] / 1e8).round(0)).tolist(),
        "male_yoy10": by_age10_m["yoy_amt_pct"].round(2).fillna(0).tolist(),
        "female_current10": ((by_age10_f["est_amt"] / 1e8).round(0)).tolist(),
        "female_prev10": ((by_age10_f["est_amt_bf"] / 1e8).round(0)).tolist(),
        "female_yoy10": by_age10_f["yoy_amt_pct"].round(2).fillna(0).tolist(),
    }

    # 업종 상세 테이블 (YoY, 단가 포함)
    tbl_data = []
    for _, r in by_ry.iterrows():
        atv = _safe_float(r.get("atv"))
        atv_bf = _safe_float(r.get("atv_bf"))
        tbl_data.append(
            {
                "ry_nm": r["ry_nm"],
                "est_amt": int(round(r["est_amt"] / 1e8)),
                "est_amt_bf": int(round(r["est_amt_bf"] / 1e8)),
                "yoy_amt_pct": dg.safe_val(r["yoy_amt_pct"]),
                "yoy_cnt_pct": dg.safe_val(r["yoy_cnt_pct"]),
                "atv": int(round(atv)) if atv is not None else None,
                "atv_bf": int(round(atv_bf)) if atv_bf is not None else None,
                "yoy_atv_pct": dg.safe_val(r["yoy_atv_pct"]),
            }
        )

    dashboard = {
        "kpi": kpi_dash,
        "industry_cross": _industry_cross(df, by_ry, by_wdn),
        "ry": ry_dash,
        "cty": cty_dash,
        "wdn": wdn_dash,
        "tm": tm_dash,
        "age": age_dash,
        "tbl": tbl_data,
        # 지역별 × 동일지역/외지유입 흐름 요약 (대시보드 하단용)
        "cty_flow": [
            {
                "cty_nm": str(r["cty_nm"]),
                "dist_type": str(r["dist_type"]),
                "amt_ukw": int(round(float(r["est_amt"]) / 1e8)),
                "amt_bf_ukw": int(round(float(r["est_amt_bf"]) / 1e8)),
                "yoy_amt_pct": dg.safe_val(r.get("yoy_amt_pct")),
            }
            for _, r in by_cty_dist[by_cty_dist["cty_nm"] != "미확인"].iterrows()
        ],
    }

    tables = {
        "industry_detail": [
            {
                "ry_nm": str(r["ry_nm"]),
                "est_amt_ukw": int(round((_safe_float(r["est_amt"]) or 0) / 1e8)),
                "est_amt_bf_ukw": int(round((_safe_float(r["est_amt_bf"]) or 0) / 1e8)),
                "yoy_amt_pct": dg.safe_val(r["yoy_amt_pct"]),
                "yoy_cnt_pct": dg.safe_val(r["yoy_cnt_pct"]),
                "atv": int(round(float(r["atv"]))) if _safe_float(r["atv"]) is not None else None,
                "atv_bf": int(round(float(r["atv_bf"]))) if _safe_float(r["atv_bf"]) is not None else None,
                "yoy_atv_pct": dg.safe_val(r["yoy_atv_pct"]),
                "source_key": f"ry_nm.{r['ry_nm']}",
            }
            for _, r in by_ry.iterrows()
        ],
        "industry_subcategory_detail": [
            {
                "ry_nm": str(r["ry_nm"]),
                "hpsn_ry_sl_cz_nm": str(r["hpsn_ry_sl_cz_nm"]),
                "est_amt_ukw": int(round((_safe_float(r["est_amt"]) or 0) / 1e8)),
                "est_amt_bf_ukw": int(round((_safe_float(r["est_amt_bf"]) or 0) / 1e8)),
                "yoy_amt_pct": dg.safe_val(r["yoy_amt_pct"]),
                "yoy_cnt_pct": dg.safe_val(r["yoy_cnt_pct"]),
                "atv": int(round(float(r["atv"]))) if _safe_float(r["atv"]) is not None else None,
                "atv_bf": int(round(float(r["atv_bf"]))) if _safe_float(r["atv_bf"]) is not None else None,
                "yoy_atv_pct": dg.safe_val(r["yoy_atv_pct"]),
                "source_key": (
                    f"ry_nm.{r['ry_nm']}.hpsn_ry_sl_cz_nm.{r['hpsn_ry_sl_cz_nm']}"
                ),
            }
            for _, r in by_ry_sub.sort_values(["ry_nm", "est_amt"], ascending=[True, False]).iterrows()
        ],
    }

    return {
        "meta": {
            "target_year": dg.TARGET_YEAR,
            "target_month": dg.TARGET_MONTH,
            "prev_year": dg.PREV_YEAR,
            "prev_month": dg.PREV_MONTH,
            "source_file": dg.SOURCE_FILE,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "holiday_weeks": hol.get("weeks", []),
        },
        "fixed_metrics": fixed_metrics,
        "tables": tables,
        "dashboard": dashboard,
        "llm_context": llm_context,
    }


def write_outputs(payload):
    ym = f"{dg.TARGET_YEAR}{dg.TARGET_MONTH:02d}"
    out_dir = os.path.join("artifacts", "reports", ym)
    os.makedirs(out_dir, exist_ok=True)

    payload_path = os.path.join(out_dir, "report_payload.json")
    with open(payload_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    meta = payload.get("meta", {})
    k = payload["fixed_metrics"]["kpi"]
    lines = [
        f"기준월: {payload['meta']['target_year']}-{payload['meta']['target_month']:02d}",
        f"비교월: {payload['meta']['prev_year']}-{payload['meta']['prev_month']:02d}",
        f"총 거래금액: {k['total_amt_ukw']}억원 (전년 {k['total_amt_bf_ukw']}억원, YoY {k['yoy_amt_pct']:.2f}%)",
        f"총 거래건수: {k['total_cnt_10k']}만건 (전년 {k['total_cnt_bf_10k']}만건, YoY {k['yoy_cnt_pct']:.2f}%)",
        "",
        "[주차별 공휴일 정보]",
    ]
    for w in meta.get("holiday_weeks", []):
        lines.append(
            f"- {w.get('wdn','?')}주차 | 기준월:{w.get('cur_range','-')} 전년:{w.get('prev_range','-')} | "
            f"기준월 공휴일:{', '.join(w.get('cur_holidays', [])) or '-'} | 전년 공휴일:{', '.join(w.get('prev_holidays', [])) or '-'}"
        )

    txt_path = os.path.join(out_dir, "report_numbers.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"payload saved: {payload_path}")
    print(f"numbers saved: {txt_path}")
    return payload_path, txt_path


def main():
    payload = build_report_payload()
    write_outputs(payload)


if __name__ == "__main__":
    main()
