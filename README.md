# DataBiz Assist — 신한카드 데이터사업 Biz Assist 포털

신한카드 데이터사업을 지원하는 사내 통합 포털입니다. 기존에 개별로 개발된 4개 도구와
신규 2개 기능을 하나의 메뉴로 모아 제공합니다.

## 기능 현황

| # | 기능 | 상태 | 원본 프로젝트 |
|---|---|---|---|
| 1 | 사업자번호 매칭/검색/업종매칭 | **이용가능** | `biz_reg_no_app` |
| 2 | KOSIS-신한카드 데이터 비교 | 준비중 (재구현 예정) | `kosis_shc` |
| 3 | 데이터 관련 뉴스수집 | 준비중 (이식 예정) | `SH_datanew_crawling` |
| 4 | 월별 소비데이터 현황 | 준비중 (재구현 예정) | `report_agent_v2` |
| 5 | 부서 공용계정 즐겨찾기 | **이용가능** | 신규 |
| 6 | My거래처 뉴스 알림 | 준비중 | 신규 |

## 기술 스택

- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **무거운 데이터 처리(pandas/scipy)**: Vercel Python 서버리스 함수 (`/api/*.py`) — 기존 프로젝트들의 pandas 로직 재사용
- **DB/Auth**: Supabase (무료 플랜) — 구조화된 데이터(사용자, 뉴스, 계산된 지표 등)만 저장
- **대용량 원본 파일**(월별 parquet 등): Google Drive (읽기 전용 서비스 계정으로 서버에서 접근)
- **배포**: Vercel

## 브랜딩

- 로고/폰트 원본: `item/` 폴더 (신한카드 로고 8종 + OneShinhan 폰트 3종)
- 웹에서 사용하는 최적화된 자산: `public/brand/logo/`, `public/brand/fonts/`
- 브랜드 컬러: `#0046FF` (Tailwind에서 `shinhan-blue`로 사용, `app/globals.css` 참고)

## 로컬 개발

```bash
npm install
npm run dev
# http://localhost:3000
```

> ⚠️ 기능1(`/biz-lookup`)의 백엔드는 Vercel Python 서버리스 함수(`api/biz/*.py`)로 구현되어
> 있습니다. `next dev`만으로는 이 함수들이 실행되지 않으므로, 로컬에서 직접 테스트하려면
> `pip install -r requirements.txt` 후 [Vercel CLI](https://vercel.com/docs/cli)의
> `vercel dev`를 사용하거나 실제 Vercel 배포 환경에서 확인하세요.

## 환경변수

`.env.example`을 참고해 `.env.local`을 생성하세요. 최소한 아래 3개는 부팅에 필요합니다.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Supabase 신규 API 키 체계 — Project Settings > API Keys)
- `API_KEY_ENCRYPTION_SECRET` (`openssl rand -base64 32`로 생성)

나머지 API 키(KOSIS, Gemini, Naver, bizno.net, SMTP, Google 서비스계정 등)는 회원가입 후
`profiles.role`을 `admin`으로 바꾼 계정으로 로그인해 **`/admin/api-keys`** 화면에서 등록하면
됩니다 (AES-256으로 암호화되어 Supabase에 저장, 서버에서만 복호화).

개인 회원도 향후 `/settings/api-keys`에서 본인 키를 등록할 수 있고, 등록 시 관리자 기본 키보다
우선 사용됩니다 (옵션으로 관리자 기본 키 사용도 선택 가능). — `user_api_keys` 테이블은 이미
준비되어 있으며, 화면은 다음 단계에서 구현합니다.

## 관리자 페이지 (`/admin`)

Supabase 설정 후 회원가입 → SQL Editor에서 `update profiles set role='admin' where email='본인이메일';`
실행 → 로그인하면 접근 가능합니다.

- **`/admin/api-keys`** — 기능별로 필요한 모든 API 키를 용도 설명과 함께 등록/교체/삭제
- **`/admin/data`** — KOSIS-신한카드 비교용 월별 신한카드 수치 입력(저장 시 KOSIS Open API
  자동 조회·병합), 월별 소비데이터 현황용 원본 파일의 Google Drive 링크 등록

## Supabase 스키마

`supabase/schema.sql`을 Supabase SQL Editor에서 실행하세요. 포함된 테이블:

- `profiles` — 사용자 프로필/권한(admin/member)
- `admin_api_keys` / `user_api_keys` — 암호화된 API 키 (관리자 기본값 / 개인 우선)
- `biz_query_history` — 기능1 조회 이력/캐시
- `news_weeks` / `news_articles` — 기능3 뉴스 수집 결과
- `user_news_watch` — 기능6 개인 키워드/거래처 설정
- `kosis_shc_monthly` — 기능2 KOSIS+신한카드 월별 병합 지표
- `dashboard_monthly_uploads` / `dashboard_monthly_metrics` — 기능4 월별 대시보드 (원본은 Google Drive, 메타데이터/계산결과만 DB에 저장)

## 폴더 구조

```
app/                  Next.js 페이지 (기능별 라우트)
components/            공용 UI 컴포넌트 (Header, Footer 등)
lib/                   설정/데이터 (features.ts, aiFavorites.ts 등)
api/biz/               기능1 Vercel Python 서버리스 함수 (조회/이력/이메일 등)
api/_shared/           Python 함수 공용 헬퍼 (Supabase REST, API 키 복호화)
data/                  기능1 업종 매핑 참조 데이터 (mct_ry_cd.json 등)
public/brand/          로고/폰트 웹 자산
supabase/schema.sql    DB 스키마
requirements.txt       Python 서버리스 함수 의존성
item/                  원본 로고/폰트 파일 (디자인 소스)
```
