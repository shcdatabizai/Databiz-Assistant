#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오뚜기 데이터 활용 제안서 생성기 (표지 + 목차 + 본문 7장)

설치
    pip install python-pptx pandas numpy lxml
    원신한 폰트(OneShinhanBold / OneShinhanMedium) 설치 필요

사용
    python build_ottogi_deck.py                       # build/오뚜기_데이터제안서.pptx
    python build_ottogi_deck.py -o 제안서.pptx
    python build_ottogi_deck.py --merge 원본.pptx     # 비교용 원본 슬라이드 삽입

구조
    shinhan_deck.py  디자인 시스템 (색/좌표/헬퍼). 디자인을 바꾸려면 여기만 수정
    DATA 섹션        페이지에 들어가는 수치. 숫자만 바꿔도 페이지가 갱신됨
    page_XX 함수     페이지 1장 = 함수 1개. 페이지 추가/삭제는 main() 에서 조립

작성 규칙
    - 좌표는 680 x 383 단위, y 는 텍스트 baseline
    - 헤드 메시지 1행은 14px 기준 40자 이내 (넘치면 줄바꿈되어 보조문과 겹침)
    - 실측 데이터는 흰 배경, 예시 수치는 illu_block + stamp 로 구분
    - 주석(note)은 10px 기준 60자 이내로 한 줄에 맞춘다
"""

import argparse
import copy
import io
import os
import re
import sys

import pandas as pd
from lxml import etree
from pptx import Presentation

from shinhan_deck import (C, I, P, blank, new_deck, txt, rect, hline, seg, polyline,
                          bar, dot, frame, head, sec, note, illu_block, stamp, cover, toc,
                          HERE)

OUT_DIR = os.path.join(HERE, "build")
TOTAL = "07"            # 본문 페이지 수 (헤더 분모)

# ══════════════════════════════════════════════════════════════════
# DATA  — 수치만 바꾸면 페이지가 갱신된다
# ══════════════════════════════════════════════════════════════════
COVER = dict(title1="오뚜기 비즈니스 인사이트 도출을 위한", title2="데이터 활용 제안",
             subtitle="국내 소비 결제 데이터 기반",
             org="신한카드 데이터사업부", date="2026. 09")

TOC_ITEMS = [
    ("01", "데이터 개요", "신한카드 데이터의 국내 소비 대표성 검증"),
    ("02", "온라인 커머스 브랜드 분석", "대형 커머스 내 브랜드 구매 MS 및 구매고객 데모 프로파일링"),
    ("03", "온라인 시장 분석", "오픈마켓 식품 셀러 및 주요 경쟁사 공식몰 매출 추이"),
    ("04", "유통 채널 분석", "식품 특화 채널의 부상 및 온 · 오프라인 점유 구조"),
    ("05", "B2B 외식업 상권 분석", "외식 업종별 결제 규모 및 업소용 타겟 세그먼트 발굴"),
    ("06", "글로벌 잠재 고객 분석", "방한 외국인 국적별 식료품 구매 트렌드 및 유망 점포"),
    ("07", "정밀 타겟 서베이", "브랜드 인식 · 만족도 조사 설계 및 결과 · Raw Data 제공"),
]

# 01 데이터 개요 — 차트는 data/matched_amount_index.csv 에서 계산
REPR_CSV = os.path.join(HERE, "data", "matched_amount_index.csv")
REPR_TOTAL_ID, REPR_FOOD_ID = "F01", "F12"      # 전체 / 식음료(요식 제외)
REPR_SCALE = {                                   # (KOSIS 하한, 상한, 신한 하한, 상한) 단위: 조원
    "total": (35, 66, 10, 19),
    "food": (10.5, 19.5, 0.24, 0.45),
}

# 02 온라인 커머스 브랜드
MS_ROWS = [("1. 오뚜기", "54.4%", "53.0%", 95, True),
           ("4. C사", "29.4%", "33.0%", 59, False),
           ("2. A사", "11.6%", "9.5%", 17, False),
           ("3. B사", "4.6%", "4.5%", 8, False)]
DEMO_ROWS = [("F01", "0.1%", "0.1%", "0.1%", "0.0%"), ("F02", "3.8%", "3.0%", "2.8%", "3.4%"),
             ("F03", "9.9%", "8.6%", "7.7%", "11.8%"), ("F04", "16.3%", "16.1%", "13.0%", "18.4%"),
             ("F05", "13.8%", "13.7%", "12.4%", "17.1%"), ("F06", "10.0%", "8.6%", "7.8%", "12.3%"),
             ("M01", "0.1%", "0.1%", "0.1%", "0.0%"), ("M02", "3.1%", "3.1%", "3.6%", "1.7%"),
             ("M03", "12.5%", "12.5%", "16.1%", "9.4%"), ("M04", "14.2%", "15.8%", "15.7%", "11.3%"),
             ("M05", "10.2%", "12.1%", "13.2%", "8.7%"), ("M06", "6.0%", "6.3%", "7.5%", "5.9%")]
LIFE_ROWS = [("오뚜기", [66, 8, 27, 87, 43, 21], True), ("A사", [64, 9, 26, 91, 44, 18], False),
             ("B사", [73, 9, 23, 84, 44, 19], False), ("C사", [62, 8, 27, 88, 44, 23], False)]
LIFE_LEGEND = [(28, "싱글"), (69, "신혼"), (110, "영유아"), (162, "청소년"), (214, "성인자녀"), (277, "실버")]

# 03 온라인 시장 — (플랫폼, 그룹중심x, 셀러수 막대높이, 라벨, 거래액 막대높이, 라벨)
PLATFORMS = [("네이버", 62, 100, "70.4", 100, "5,131"), ("G마켓", 122, 9, "6.4", 16, "796"),
             ("옥션", 182, 16, "11.1", 4, "216"), ("11번가", 242, 13, "9.1", 2, "45")]
# D = 입점 확인(●), O = 미확인(○), 숫자는 확인된 공식몰 매출
BRAND_ROWS = [("오뚜기", ["1,020", "D", "O", "76", "O"], "1,096", True),
              ("CJ제일제당", ["2,209", "D", "O", "O", "D"], "2,209", False),
              ("대상", ["964", "D", "65", "6", "D"], "1,034", False),
              ("농심", ["951", "O", "O", "O", "D"], "951", False),
              ("삼양", ["271", "D", "O", "O", "D"], "271", False),
              ("팔도", ["70", "O", "O", "O", "O"], "70", False)]

# 04 유통 채널
CHANNEL_MIX = [("온라인", 57.5), ("식품 전문소매", 13.3), ("슈퍼마켓", 11.0),
               ("편의점", 9.8), ("대형마트", 8.4)]
FOOD_CHANNELS = [("농협 하나로", "0068B7", 100, "29.5%"), ("식자재마트", "7A88A6", 94, "27.8%"),
                 ("이마트 트레이더스", "F2A20C", 62, "18.4%"), ("컬리", "5F0080", 57, "16.8%"),
                 ("오아시스", "00A79D", 13, "3.9%"), ("한살림", "4CA22F", 12, "3.4%"),
                 ("두레생협", "8CC63F", 2, "0.1%")]
DEMO_GRID = [("남", [("6.2", "E6EEFF"), ("9.8", "B3CCFF"), ("8.1", "B3CCFF"), ("4.4", "E6EEFF")]),
             ("여", [("14.6", "B3CCFF"), ("22.3", "0046FF"), ("19.1", "7FA3FF"), ("15.5", "7FA3FF")])]

# 05 B2B 외식업
FOODSERVICE = [("요식배달", 95, "24.5%"), ("한식-육류/고기", 74, "19.0%"),
               ("한식-단품요리", 66, "16.9%"), ("백반/가정식", 55, "14.1%"),
               ("한식-해물/생선", 32, "8.3%"), ("카페", 24, "6.3%"),
               ("커피전문점", 21, "5.5%"), ("중식당", 21, "5.3%")]
SEGMENTS = [("배달 채널", 416, "요식배달 · 배달 소스/포장", "56.1%", 240, True),
            ("소스 · 유지", 416, "분식 · 치킨 · 햄버거 · 피자", "24.2%", 104, False),
            ("면 · 분식", 416, "국수/만두 · 우동/라면 · 분식", "13.8%", 59, False),
            ("대용량 카레 · 즉석", 452, "구내식당 · 뷔페 · 도시락", "6.0%", 26, False)]
TRADE_AREA = [("강남역", 100, "4.8"), ("홍대입구", 75, "3.6"), ("여의도", 60, "2.9"), ("판교", 50, "2.4")]
TRADE_TABLE = [("강남역", "1,240", "4.2%", "8.1%"), ("판교", "540", "6.1%", "16.8%"),
               ("여의도", "610", "2.8%", "14.2%")]

# 06 글로벌
NATIONS = [("일본", 140, "39.7%", True), ("대만", 65, "18.5%", False), ("중국", 34, "9.7%", False),
           ("미국", 23, "6.6%", False), ("홍콩", 20, "5.8%", False), ("싱가폴", 16, "4.6%", False),
           ("필리핀", 5, "1.4%", False), ("태국", 4, "1.1%", False)]
STORES = [("서울역점", "88.4%", [65, 35, 17, 59]), ("김포공항점", "11.4%", [110, 13, 13, 40]),
          ("사상점", "0.2%", [35, 50, 21, 70])]
UNIT_PRICE = [("중국", 145, "145"), ("대만", 122, "122"), ("싱가폴", 118, "118"), ("일본", 100, "100")]

# 07 서베이
SURVEY_ROWS = [("조사 대상", "카드결제이력 및 타겟 고객 관련 맞춤 설정 가능"),
               ("쿼터 설정", "성 · 연령별, 지역별 응답자 쿼터 설정 가능"),
               ("결과 제공", "결과 리포트 및 Raw Data 전달 · 내부 심층 분석 가능"),
               ("응답 리워드", "설문 응답 완료 고객 대상 카드 포인트 리워드 제공")]
SURVEY_IMAGES = ["survey_1.png", "survey_2.png", "survey_3.png"]


# ══════════════════════════════════════════════════════════════════
# 01 데이터 개요
# ══════════════════════════════════════════════════════════════════
def load_repr():
    """대표성 CSV에서 전체 / 식음료 월별 금액 시계열을 뽑는다"""
    df = pd.read_csv(REPR_CSV, encoding="utf-8-sig")
    df.columns = [c.replace("\ufeff", "").strip() for c in df.columns]
    out = {}
    for key, mid in (("total", REPR_TOTAL_ID), ("food", REPR_FOOD_ID)):
        x = (df[df["매칭ID"] == mid].sort_values("기준년월")
             .dropna(subset=["KOSIS_금액_백만원", "신한_금액_백만원"]).reset_index(drop=True))
        out[key] = dict(ym=x["기준년월"].astype(str).tolist(),
                        a=(x["KOSIS_금액_백만원"].astype(float) / 1e6).tolist(),
                        b=(x["신한_금액_백만원"].astype(float) / 1e6).tolist())
    return out


def dual_chart(sl, series, scale, x0, x1, y_bot, h, step=3):
    """통계청(회색, 우축) vs 신한카드(파랑, 좌축) 이중축 라인.
    두 축 배율을 커버리지 비율에 맞춰 두면 선이 포개질수록 비율이 안정적이라는 뜻이 된다."""
    klo, khi, slo, shi = scale
    a, b = series["a"][::step], series["b"][::step]
    n = len(a)
    xs = [x0 + i * (x1 - x0) / (n - 1) for i in range(n)]
    fk = lambda v: y_bot - (v - klo) * h / (khi - klo)
    fs = lambda v: y_bot - (v - slo) * h / (shi - slo)
    hline(sl, x0, x1, y_bot, C["line"], 0.8)
    polyline(sl, xs, [fk(v) for v in a], C["gray"], 1.3)
    polyline(sl, xs, [fs(v) for v in b], C["blue"], 1.5)
    for yr in sorted({s[:4] for s in series["ym"]})[::2]:
        idx = next(i for i, s in enumerate(series["ym"][::step]) if s[:4] == yr)
        txt(sl, xs[idx], y_bot + 18, yr, 10, C["lgray"], align="c", w=34)


def page_01(prs, repr_data):
    sl = blank(prs)
    frame(sl, "01", TOTAL, "데이터 개요")
    rect(sl, 28, 56, 4, 26, fill=C["blue"])
    txt(sl, 42, 74, "국내 소비 트렌드의 가장 정확한 지표, 신한카드 데이터", 14, C["navy"], bold=True, w=600)

    rect(sl, 28, 88, 624, 42, fill=C["tint"], rx=8)
    txt(sl, 44, 105, "신용카드 지출은 대한민국 민간소비의 70%를 차지합니다. 업계 1위 신한카드의 결제 데이터는",
        11, C["navy"], w=596)
    txt(sl, 44, 120, "국내 소비를 대변하는 가장 강력하고 대표성 높은 지표입니다.", 11, C["navy"], w=596)

    txt(sl, 28, 152, "데이터 대표성 요약", 11, C["blue"], bold=True, w=200)
    for t, v, d, y in [("민간소비 커버리지", "70%", "민간소비 중 신용카드 지출 비중", 178),
                       ("소매판매액 상관계수", "0.925", "통계청 KOSIS 기준 · 식음료도 0.925", 262)]:
        rect(sl, 28, y, 222, 70, fill=C["soft"], rx=8)
        txt(sl, 42, y + 28, t, 11, C["navy"], bold=True, w=130)
        txt(sl, 236, y + 30, v, 16, C["blue"], bold=True, align="r", w=80)
        txt(sl, 42, y + 50, d, 10, C["gray"], w=196)

    rect(sl, 458, 145, 7, 7, fill=C["gray"])
    txt(sl, 469, 152, "통계청 (우축)", 11, C["sub"], w=78)
    rect(sl, 556, 145, 7, 7, fill=C["blue"])
    txt(sl, 567, 152, "신한카드 (좌축)", 11, C["sub"], w=88)

    txt(sl, 272, 152, "① 전체 소비", 11, C["blue"], bold=True, w=110)
    txt(sl, 300, 166, "좌 10 – 19조   ·   우 35 – 66조", 10, C["lgray"], w=220)
    dual_chart(sl, repr_data["total"], REPR_SCALE["total"], 300, 640, 216, 62)

    txt(sl, 272, 262, "② 식음료", 11, C["blue"], bold=True, w=110)
    txt(sl, 300, 276, "좌 0.24 – 0.45조   ·   우 10.5 – 19.5조", 10, C["lgray"], w=260)
    dual_chart(sl, repr_data["food"], REPR_SCALE["food"], 300, 640, 326, 62)

    note(sl, 360, "※ 통계청 소매판매액 경상금액(KOSIS) 기준 · 2020.01 ~ 2026.06 월별 78개월 · 차트는 분기 시점 표본")
    note(sl, 374, "※ 식음료는 신한 음/식료품 업종 기준(요식 · 유흥 제외) · 커버리지 28.8% · 2.3%, "
                  "YoY 방향 일치율 87.9% · 86.4%")
    return sl


# ══════════════════════════════════════════════════════════════════
# 02 온라인 커머스 브랜드 분석
# ══════════════════════════════════════════════════════════════════
def page_02(prs):
    sl = blank(prs)
    frame(sl, "02", TOTAL, "온라인 커머스 브랜드 분석")
    head(sl, "대형 온라인 커머스 채널 내 오뚜기 vs 경쟁 브랜드 점유율 및 구매고객 프로파일링",
         "브랜드(제품) 구매 고객의 성 · 연령대별 비중과 생활단계별 비중 트렌드를 브랜드 간 비교할 수 있습니다")

    sec(sl, 28, 330, 116, "① 4개 브랜드 구매 MS · 202608")
    txt(sl, 28, 134, "브랜드", 11, C["gray"], w=60)
    txt(sl, 150, 134, "건수", 11, C["gray"], align="r", w=50)
    txt(sl, 225, 134, "매출액", 11, C["gray"], align="r", w=55)
    hline(sl, 28, 330, 139, C["line"], 0.6)
    for i, (n, a, b, w, hl) in enumerate(MS_ROWS):
        y = 153 + i * 15
        txt(sl, 28, y, n, 11, C["blue"] if hl else C["mid"], bold=hl, w=70)
        txt(sl, 150, y, a, 11, C["navy"] if hl else C["mid"], align="r", w=50, bold=hl)
        txt(sl, 225, y, b, 11, C["navy"] if hl else C["mid"], align="r", w=55, bold=hl)
        bar(sl, 235, y - 7, w, 8, C["blue"] if hl else C["b4"])

    sec(sl, 28, 330, 224, "③ 라이프스테이지 · 생활단계별 구매 고객 비중")
    ls_colors = [C["blue"], "3D74FF", "7FA3FF", "9DBBFF", "B3CCFF", "D6E1F7"]
    for i, (x, n) in enumerate(LIFE_LEGEND):
        rect(sl, x, 235, 7, 7, fill=ls_colors[i])
        txt(sl, x + 11, 242, n, 10, C["sub"], w=50)
    for i, (n, segs, hl) in enumerate(LIFE_ROWS):
        y = 264 + i * 18
        txt(sl, 28, y, n, 11, C["blue"] if hl else C["mid"], bold=hl, w=46)
        cx = 78
        for j, w in enumerate(segs):
            bar(sl, cx, y - 9, w, 12, ls_colors[j])
            cx += w

    sec(sl, 352, 652, 116, "② 구매자 데모 · 성 · 연령대별 구매 고객 비중")
    txt(sl, 352, 134, "성/연령대", 11, C["gray"], w=70)
    for x, n in [(470, "오뚜기"), (530, "A사"), (590, "B사"), (648, "C사")]:
        txt(sl, x, 134, n, 11, C["gray"], align="r", w=56)
    hline(sl, 352, 652, 139, C["line"], 0.6)
    for i, row in enumerate(DEMO_ROWS):
        y = 153 + i * 14
        if i % 2 == 1:
            rect(sl, 352, y - 11, 300, 14, fill="F5F8FF")
        txt(sl, 352, y, row[0], 11, C["mid"], w=60)
        for k, x in enumerate([470, 530, 590, 648], start=1):
            txt(sl, x, y, row[k], 11, C["navy"] if k == 1 else C["mid"],
                align="r", w=56, bold=(k == 1))

    txt(sl, 28, 344, "※ F · M = 성별(여 · 남), 01~06 = 연령대 구간", 10, C["gray"], w=400)
    note(sl, 366, "※ 대형 온라인 커머스 내 결제 건수 · 매출액 기준 비중이며 실매출액은 제공하지 않습니다 · "
                  "브랜드 범위는 협의 후 확정")
    return sl


# ══════════════════════════════════════════════════════════════════
# 03 온라인 시장 분석
# ══════════════════════════════════════════════════════════════════
def page_03(prs):
    sl = blank(prs)
    frame(sl, "03", TOTAL, "온라인 시장 분석")
    head(sl, "주요 이커머스 플랫폼별 온라인 실매출 규모를 교차 분석합니다",
         "브랜드 공식몰과 리셀러를 사업자번호 단위로 식별해, 경쟁사별 매출 규모와 플랫폼 구성을 함께 확인할 수 있습니다")

    sec(sl, 28, 280, 116, "① 플랫폼별 식품 셀러 수 · 거래액 · 26.7")
    rect(sl, 28, 133, 7, 7, fill=C["b2"])
    txt(sl, 39, 140, "셀러 수 (천)", 11, C["sub"], w=80)
    rect(sl, 118, 133, 7, 7, fill=C["blue"])
    txt(sl, 129, 140, "식품 거래액 (억원)", 11, C["sub"], w=110)
    hline(sl, 28, 280, 268, C["line"], 0.8)
    for n, c, h1, v1, h2, v2 in PLATFORMS:
        rect(sl, c - 26, 268 - h1, 22, h1, fill=C["b2"])
        rect(sl, c + 4, 268 - h2, 22, h2, fill=C["blue"])
        txt(sl, c - 15, 268 - h1 - 5, v1, 10, C["mid"], align="c", w=40)
        txt(sl, c + 15, 268 - h2 - 5, v2, 10, C["navy"], align="c", w=40, bold=True)
        txt(sl, c, 284, n, 11, C["mid"], align="c", w=60)
    txt(sl, 28, 306, "카카오 12,221 셀러는 거래액 미제공", 10, C["gray"], w=250)

    sec(sl, 300, 652, 116, "② 경쟁 6사 공식몰 입점 · 매출 (백만원)")
    txt(sl, 300, 140, "브랜드", 11, C["gray"], w=60)
    col_r = [424, 474, 524, 570, 616]
    col_c = [393, 449, 499, 547, 593]
    for x, n in zip(col_r + [652], ["네이버", "11번가", "G마켓", "옥션", "카카오", "계"]):
        txt(sl, x, 140, n, 11, C["gray"], align="r", w=50)
    hline(sl, 300, 652, 146, C["line"], 0.6)
    rect(sl, 300, 152, 352, 19, fill=C["tint"], rx=2)
    for i, (n, cells, tot, hl) in enumerate(BRAND_ROWS):
        y = 164 + i * 19
        txt(sl, 300, y, n, 11, C["blue"] if hl else C["mid"], bold=hl, w=90)
        for j, v in enumerate(cells):
            if v == "D":
                dot(sl, col_c[j], y - 4, 3.2, fill=C["blue"] if hl else C["b1"])
            elif v == "O":
                dot(sl, col_c[j], y - 4, 3.2, hollow=True)
            else:
                txt(sl, col_r[j], y, v, 11, C["navy"] if hl else C["mid"],
                    align="r", w=50, bold=hl)
        txt(sl, 652, y, tot, 11, C["blue"] if hl else C["navy"], align="r", w=50, bold=True)
    dot(sl, 303, 278, 3.2, fill=C["b1"])
    txt(sl, 312, 282, "입점 확인", 10, C["gray"], w=60)
    dot(sl, 372, 278, 3.2, hollow=True)
    txt(sl, 381, 282, "미확인 · 숫자는 확인된 공식몰 매출 (산출 예시)", 10, C["gray"], w=280)
    stamp(sl, 560, 312)

    note(sl, 358, "※ 쿠팡은 로켓배송(직매입) 매출이 제외되어 브랜드 실판매를 과소 반영하므로 본 페이지에서 제외했습니다",
         color=C["red"])
    note(sl, 372, "※ 셀러 수는 플랫폼 간 중복 포함 · 매출은 신용카드 추정액 기준 · 사업자번호 단위 합산으로 개별 매장 분해 불가")
    return sl


# ══════════════════════════════════════════════════════════════════
# 04 유통 채널 분석
# ══════════════════════════════════════════════════════════════════
def page_04(prs):
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE

    sl = blank(prs)
    frame(sl, "04", TOTAL, "유통 채널 분석")
    head(sl, "전체 유통 채널의 결제 비중 변화와 식품 특화 채널의 점유 구조를 제공합니다",
         "대형마트 · 편의점 · 온라인 등 전체 채널 비중과 함께, 급부상하는 식품 특화 채널의 점유 구조와 구매자 구성을 확인할 수 있습니다")

    sec(sl, 28, 330, 116, "① 채널별 결제 비중 · 26.7")
    cd = CategoryChartData()
    cd.categories = [n for n, _ in CHANNEL_MIX]
    cd.add_series("채널 비중", tuple(v for _, v in CHANNEL_MIX))
    gf = sl.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, I(30), I(136), I(150), I(150), cd)
    ch = gf.chart
    ch.has_legend = False
    ch.has_title = False
    # 도넛 구멍 크기(기본 75) — 가운데 수치가 들어가도록 62로 줄인다
    hole = ch._chartSpace.find(".//{http://schemas.openxmlformats.org/drawingml/2006/chart}holeSize")
    if hole is not None:
        hole.set("val", "62")
    plot = ch.plots[0]
    for pt, col in zip(plot.series[0].points,
                       [C["blue"], "3D74FF", "7FA3FF", "9DBBFF", "B3CCFF"]):
        pt.format.fill.solid()
        pt.format.fill.fore_color.rgb = __import__("pptx").dml.color.RGBColor.from_string(col)
        pt.format.line.color.rgb = __import__("pptx").dml.color.RGBColor.from_string("FFFFFF")
        pt.format.line.width = P(1.1)
    txt(sl, 105, 205, "온라인", 10, C["gray"], align="c", w=70)
    txt(sl, 105, 224, "57.5%", 16, C["blue"], align="c", w=80, bold=True)
    # 차트 영역 여백 제거 (제목 공간이 빠지면서 도넛이 중앙에 오도록)

    for i, ((n, v), col) in enumerate(zip(CHANNEL_MIX,
                                          [C["blue"], "3D74FF", "7FA3FF", "9DBBFF", "B3CCFF"])):
        y = 152 + i * 28
        rect(sl, 192, y - 8, 8, 8, fill=col, rx=2)
        txt(sl, 206, y, n, 10, C["mid"], w=90)
        txt(sl, 330, y, f"{v}%", 10, C["navy"] if i == 0 else C["mid"], align="r", w=44, bold=(i == 0))
    txt(sl, 28, 302, "온라인은 대형 이커머스 · 전자상거래 · 홈쇼핑 합산이며 전 카테고리 결제를 포함합니다",
        10, C["gray"], w=310)

    sec(sl, 352, 652, 116, "② 식품 특화 채널 결제 비중 · 7개 채널 내")
    tones = [C["blue"], C["b1"], C["b1"], C["b2"], C["b3"], C["b3"], C["b3"]]
    for i, (n, chip, w, v) in enumerate(FOOD_CHANNELS):
        y = 137 + i * 14
        rect(sl, 352, y - 8, 10, 10, fill=chip, rx=2)
        txt(sl, 368, y, n, 11, C["mid"], w=105)
        bar(sl, 480, y - 7, w, 8, tones[i])
        txt(sl, 640, y, v, 11, C["navy"] if i == 0 else C["mid"], align="r", w=46, bold=(i == 0))
    txt(sl, 352, 240, "가맹점 단위 매칭으로 브랜드별 개별 집계", 10, C["gray"], w=300)

    illu_block(sl, 352, 252, 300, 92, "③ 연령 × 성별 결제 구성 · 산출 예시 (%)")
    for i, lab in enumerate(["20대", "30대", "40대", "50대"]):
        txt(sl, 421 + i * 64, 292, lab, 10, C["gray"], align="c", w=58)
    for r, (lab, cells) in enumerate(DEMO_GRID):
        ty, ry = 309 + r * 22, 297 + r * 22
        txt(sl, 386, ty, lab, 10, C["gray"], align="r", w=30)
        for i, (v, f) in enumerate(cells):
            rect(sl, 392 + i * 64, ry, 58, 16, fill=f, rx=2)
            txt(sl, 421 + i * 64, ty, v, 10, C["white"] if f == "0046FF" else C["navy"],
                align="c", w=58)

    note(sl, 360, "※ 신한카드 결제 기준 비중이며 실매출액은 제공하지 않습니다 · 식품 특화 채널은 가맹점 단위 매칭 결과입니다")
    note(sl, 374, "※ 연령 · 성별 결제 구성은 제공 형태를 보여주기 위한 예시 수치이며, 지역(시도 · 시군구) 축 결합도 제공 가능합니다")
    return sl


# ══════════════════════════════════════════════════════════════════
# 05 B2B 외식업 상권 분석
# ══════════════════════════════════════════════════════════════════
def page_05(prs):
    sl = blank(prs)
    frame(sl, "05", TOTAL, "B2B 외식업 상권 분석")
    head(sl, "외식 결제를 배달 · 오프라인으로 세분화해 유망 거래처를 발굴합니다",
         "오뚜기 업소용 제품군에 최적화된 외식 업종 세그먼트와 상권별 점포 수 · 신규 개업률을 함께 제공해 "
         "B2B 영업 우선순위 판단에 바로 활용할 수 있습니다")

    sec(sl, 28, 310, 116, "① 외식 상위 8개 업종 결제 비중 · 26.7")
    tones = [C["blue"], C["b1"], C["b1"], C["b1"], C["b2"], C["b2"], C["b3"], C["b3"]]
    for i, (n, w, v) in enumerate(FOODSERVICE):
        y = 136 + i * 13
        txt(sl, 28, y, n, 11, C["mid"], w=118)
        bar(sl, 150, y - 7, w, 8, tones[i])
        txt(sl, 310, y, v, 11, C["navy"] if i == 0 else C["mid"], align="r", w=46, bold=(i == 0))
    txt(sl, 28, 245, "요식배달은 온라인 결제 기준", 10, C["gray"], w=240)

    sec(sl, 352, 652, 116, "② 업소용 제품군 매칭 세그먼트 · 4개 세그먼트 내 비중")
    seg_tones = [C["blue"], C["b1"], C["b2"], C["b3"]]
    for i, (n, dx, det, v, w, hl) in enumerate(SEGMENTS):
        y = 140 + i * 31
        txt(sl, 352, y, n, 11, C["navy"], bold=True, w=110)
        txt(sl, dx, y, det, 11, C["gray"], w=200)
        txt(sl, 640, y, v, 11, C["blue"] if hl else C["mid"], align="r", w=60, bold=hl)
        bar(sl, 352, y + 5, w, 7, seg_tones[i])

    illu_block(sl, 28, 256, 624, 96, "③ 상권 · 지역 축 결합 · 산출 예시")
    txt(sl, 40, 289, "상권별 외식 결제 비중 (%)", 11, C["sub"], w=220)
    ta_tones = [C["blue"], C["b1"], C["b2"], C["b2"]]
    for i, (n, w, v) in enumerate(TRADE_AREA):
        y = 305 + i * 12
        txt(sl, 40, y, n, 11, C["mid"], w=76)
        bar(sl, 120, y - 7, w, 7, ta_tones[i])
        txt(sl, 260, y, v, 11, C["mid"], align="r", w=50)
    txt(sl, 352, 289, "업소용 타겟 적합도 지표", 11, C["sub"], w=220)
    txt(sl, 352, 305, "상권", 11, C["gray"], w=80)
    for x, n in [(470, "점포수"), (555, "신규개업률"), (640, "급식 비중")]:
        txt(sl, x, 305, n, 11, C["gray"], align="r", w=70)
    hline(sl, 352, 640, 309, C["pinkln"], 0.6)
    for i, (n, a, b, c) in enumerate(TRADE_TABLE):
        y = 323 + i * 12
        txt(sl, 352, y, n, 11, C["mid"], w=80)
        for x, v in [(470, a), (555, b), (640, c)]:
            txt(sl, x, y, v, 11, C["mid"], align="r", w=70)
    stamp(sl, 570, 266)

    note(sl, 366, "※ 신한카드 결제 기준 비중이며 실매출액은 제공하지 않습니다 · 업종 분류는 가맹점 업종코드 기준입니다")
    note(sl, 378, "※ 상권별 지표는 예시 수치이며, 실제 상권 정의는 협의 후 확정합니다")
    return sl


# ══════════════════════════════════════════════════════════════════
# 06 글로벌 잠재 고객 분석
# ══════════════════════════════════════════════════════════════════
def page_06(prs):
    sl = blank(prs)
    frame(sl, "06", TOTAL, "글로벌 잠재 고객 분석")
    head(sl, "핵심 점포별 외국인 결제를 국적별로 상세 분석합니다",
         "인바운드 특화 매대 기획과 수출 우선순위 국가 선정의 객관적 근거로 활용할 수 있습니다")

    sec(sl, 28, 320, 116, "① 국적별 결제 구성 · 3개 점포 합산")
    tones = [C["blue"], C["b1"], C["b1"], C["b2"], C["b2"], C["b2"], C["b3"], C["b3"]]
    for i, (n, w, v, hl) in enumerate(NATIONS):
        y = 142 + i * 17
        txt(sl, 28, y, n, 11, C["mid"], w=90)
        bar(sl, 120, y - 8, w, 10, tones[i])
        txt(sl, 320, y, v, 11, C["navy"] if hl else C["mid"], align="r", w=46, bold=hl)
    txt(sl, 28, 286, "상위 5개국이 전체의 80.2% · 확인 국적 108개국", 10, C["gray"], w=300)

    sec(sl, 340, 652, 116, "② 점포별 외국인 국적 구성 · 100%")
    c4 = [C["blue"], C["b1"], C["b2"], C["b3"]]
    for i, (x, n) in enumerate([(340, "일본"), (392, "대만"), (440, "중국"), (488, "기타")]):
        rect(sl, x, 130, 7, 7, fill=c4[i])
        txt(sl, x + 11, 137, n, 10, C["sub"], w=40)
    txt(sl, 652, 137, "결제 비중", 10, C["gray"], align="r", w=80)
    for i, (n, sh, segs) in enumerate(STORES):
        y = 164 + i * 26
        txt(sl, 340, y, n, 11, C["navy"], bold=True, w=76)
        cx = 424
        for j, w in enumerate(segs):
            bar(sl, cx, y - 9, w, 12, c4[j])
            cx += w
        txt(sl, 652, y, sh, 11, C["mid"], align="r", w=46)
    txt(sl, 340, 238, "김포공항점 일본 62.7% 편중 · 서울역점 일본 · 대만 분산", 10, C["gray"], w=310)

    illu_block(sl, 340, 252, 312, 92, "③ 국적별 평균 결제 단가 지수 · 산출 예시 (일본 = 100)")
    up_tones = [C["blue"], C["b1"], C["b1"], C["b2"]]
    for i, (n, w, v) in enumerate(UNIT_PRICE):
        y = 292 + i * 16
        txt(sl, 356, y, n, 10, C["mid"], w=60)
        bar(sl, 424, y - 7, w, 8, up_tones[i])
        txt(sl, 640, y, v, 10, C["mid"], align="r", w=40)

    note(sl, 360, "※ 롯데마트 3개 점포(서울역 · 김포공항 · 사상) 신용카드 결제 기준 · 국적 미확인 건은 집계에서 제외")
    note(sl, 374, "※ 국적별 평균 결제 단가는 제공 형태를 보여주기 위한 예시 수치이며, 월별 결제 지수도 함께 제공 가능합니다")
    return sl


# ══════════════════════════════════════════════════════════════════
# 07 정밀 타겟 서베이
# ══════════════════════════════════════════════════════════════════
def page_07(prs):
    sl = blank(prs)
    frame(sl, "07", TOTAL, "정밀 타겟 서베이")
    head(sl, "오뚜기 및 경쟁 브랜드 구매 고객을 대상으로 브랜드 인식 · 구매 경험 · 만족도를 조사 실시",
         "결제 데이터로 응답 대상을 정밀 선별하고, 설문 결과 리포트와 Raw Data를 함께 제공합니다")

    sec(sl, 28, 652, 116, "① 서베이 개요 · 제공 범위")
    for i, (t, d) in enumerate(SURVEY_ROWS):
        y = 138 + i * 23
        rect(sl, 28, y - 14, 624, 20, fill=C["soft"] if i % 2 == 0 else C["white"], rx=4)
        txt(sl, 44, y, t, 11, C["navy"], bold=True, w=100)
        txt(sl, 156, y, d, 11, C["mid"], w=480)

    sec(sl, 28, 652, 232, "② 설문지 · 결과표 예시")
    widths = [107, 141, 137]
    xs = [136, 255, 408]
    for fn, x, w in zip(SURVEY_IMAGES, xs, widths):
        path = os.path.join(HERE, "assets", fn)
        if os.path.exists(path):
            sl.shapes.add_picture(path, I(x), I(244), I(w), I(120))

    note(sl, 378, "※ 설문지 · 결과표 이미지는 제공 형태를 보여주기 위한 타 브랜드 조사 예시이며, "
                  "실제 문항과 쿼터는 협의 후 확정합니다")
    return sl


# ══════════════════════════════════════════════════════════════════
# 원본 슬라이드 병합 (비교본)
# ══════════════════════════════════════════════════════════════════
def merge_slides(dst_path, src_path, positions=None):
    """다른 pptx의 슬라이드를 도형·이미지·서식 그대로 복사해 삽입한다.
    positions: {원본 슬라이드 인덱스(0-based): 삽입 위치(0-based)} · None 이면 뒤에 붙인다"""
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT

    src, dst = Presentation(src_path), Presentation(dst_path)
    layout = dst.slide_layouts[6]
    n_before = len(dst.slides)

    for s in src.slides:
        new = dst.slides.add_slide(layout)
        for shp in list(new.shapes):
            shp._element.getparent().remove(shp._element)
        rmap = {}
        for rId, rel in s.part.rels.items():
            if rel.reltype == RT.SLIDE_LAYOUT:
                continue
            if rel.is_external:
                rmap[rId] = new.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
            elif rel.reltype == RT.IMAGE:
                # 이미지는 파트명이 충돌하므로 새 파트로 등록한다 (해시가 같으면 자동 재사용)
                img = new.part.get_or_add_image_part(io.BytesIO(rel.target_part.blob))[0]
                rmap[rId] = new.part.relate_to(img, RT.IMAGE)
            else:
                rmap[rId] = new.part.relate_to(rel.target_part, rel.reltype)
        for shp in s.shapes:
            xml = copy.deepcopy(shp._element).xml
            for old, newr in rmap.items():
                xml = re.sub(r'(r:(?:id|embed|link)=")%s(")' % old, r"\g<1>%s\g<2>" % newr, xml)
            new.shapes._spTree.append(etree.fromstring(xml))

    if positions:
        lst = dst.slides._sldIdLst
        ids = list(lst)
        for src_i, at in sorted(positions.items(), key=lambda kv: kv[1]):
            el = ids[n_before + src_i]
            lst.remove(el)
            lst.insert(at, el)
    dst.save(dst_path)
    return len(dst.slides)


# ══════════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default=os.path.join(OUT_DIR, "오뚜기_데이터제안서.pptx"))
    ap.add_argument("--merge", default=None, help="비교용 원본 pptx 경로")
    ap.add_argument("--merge-at", default="4,-1",
                    help="원본 슬라이드 삽입 위치 (0-based, 쉼표 구분, -1은 맨 뒤)")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)

    repr_data = load_repr()
    prs = new_deck()
    cover(prs, COVER["title1"], COVER["title2"], COVER["subtitle"], COVER["org"], COVER["date"])
    toc(prs, TOC_ITEMS)
    page_01(prs, repr_data)
    page_02(prs)
    page_03(prs)
    page_04(prs)
    page_05(prs)
    page_06(prs)
    page_07(prs)
    prs.save(args.out)
    print(f"완료 → {args.out}  ({len(prs.slides)}장)")

    if args.merge:
        n_body = len(prs.slides)
        pos = {}
        for i, raw in enumerate(args.merge_at.split(",")):
            v = int(raw.strip())
            pos[i] = n_body + i if v < 0 else v
        total = merge_slides(args.out, args.merge, pos)
        print(f"원본 병합 완료 → {args.out}  ({total}장)")


if __name__ == "__main__":
    main()
