-- =========================================================
-- DataBiz Assist — Supabase 스키마
-- Supabase SQL Editor에서 순서대로 실행하세요.
-- 원본 대용량 파일(월별 parquet 등)은 이 DB에 저장하지 않고
-- Google Drive에 두고 파일 ID/링크만 메타데이터로 저장합니다.
-- =========================================================

-- ---------------------------------------------------------
-- 0) 공통: updated_at 자동 갱신 트리거 함수
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------
-- 1) profiles — auth.users 확장 (부서/권한)
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  department text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 신규 가입 시 자동으로 profiles row 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table public.profiles is '부서원 프로필 및 권한(admin/member). role=admin만 /admin 접근 가능.';

-- ---------------------------------------------------------
-- 2) admin_api_keys — 관리자가 등록한 기본 API 키 (서비스 롤 전용, 암호화 저장)
-- ---------------------------------------------------------
create table if not exists public.admin_api_keys (
  key_name text primary key,
  key_value_encrypted text not null,
  description text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_api_keys enable row level security;
-- 정책 없음 = anon/authenticated 접근 전면 차단. 서버(Service Role)만 접근.

comment on table public.admin_api_keys is
  '관리자 기본 API 키 (KOSIS/Gemini/Naver/bizno/공공데이터/Anthropic/SMTP/GitHub PAT/Google 서비스계정 등). key_value_encrypted는 AES-256-GCM 암호문.';

-- ---------------------------------------------------------
-- 3) user_api_keys — 개인 회원이 등록한 API 키 (관리자 키보다 우선)
-- ---------------------------------------------------------
create table if not exists public.user_api_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  key_name text not null,
  key_value_encrypted text not null,
  use_admin_default boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, key_name)
);

alter table public.user_api_keys enable row level security;

drop policy if exists user_api_keys_owner on public.user_api_keys;
create policy user_api_keys_owner on public.user_api_keys
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.user_api_keys is
  '개인 회원 API 키. use_admin_default=true면 개인 키가 없을 때 admin_api_keys 값을 사용.';

-- ---------------------------------------------------------
-- 4) biz_query_history — 기능1 사업자번호 조회 이력/캐시 (biz_reg_no_app 이식)
-- ---------------------------------------------------------
create table if not exists public.biz_query_history (
  id bigint generated always as identity primary key,
  brno varchar(10) not null,
  brno_formatted varchar(13) not null,
  company_name varchar(255),
  query_date timestamptz not null default timezone('utc', now()),
  bizno_result jsonb,
  gov_result jsonb,
  crawl_result jsonb,
  ftc_result jsonb,
  mct_ry_cd_result jsonb,
  hpsn_mct_zcd_result jsonb,
  mapping_reasoning text,
  queried_by uuid references auth.users (id)
);

create index if not exists idx_biz_query_history_brno on public.biz_query_history (brno);
create index if not exists idx_biz_query_history_date on public.biz_query_history (query_date desc);

alter table public.biz_query_history enable row level security;

drop policy if exists biz_query_history_rw on public.biz_query_history;
create policy biz_query_history_rw on public.biz_query_history
  for all to authenticated using (true) with check (true);

comment on table public.biz_query_history is '사업자번호 조회 이력/90일 캐시 (biz_reg_no_app 이식).';

-- ---------------------------------------------------------
-- 5) news_weeks / news_articles — 기능3 데이터뉴스 수집 (SH_datanew_crawling 이식)
-- ---------------------------------------------------------
create table if not exists public.news_weeks (
  week text primary key, -- 예: '2026-W38'
  collected_at date,
  period_from date,
  period_to date,
  total_raw int,
  total_after_dedup int,
  total_final int,
  queries_used text[]
);

create table if not exists public.news_articles (
  id text primary key, -- 예: '2026-W38-001'
  week text references public.news_weeks (week) on delete cascade,
  article_date date,
  source text,
  source_tier text check (source_tier in ('tier1', 'tier2', 'tier3', 'unknown')),
  title text not null,
  summary_snippet text,
  summary_claude text,
  keywords text[],
  url text not null,
  score int check (score between 0 and 100),
  score_detail jsonb,
  search_query text,
  related_articles jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_news_articles_week on public.news_articles (week);
create index if not exists idx_news_articles_date on public.news_articles (article_date desc);
create index if not exists idx_news_articles_keywords on public.news_articles using gin (keywords);

alter table public.news_weeks enable row level security;
alter table public.news_articles enable row level security;

drop policy if exists news_weeks_read on public.news_weeks;
create policy news_weeks_read on public.news_weeks for select to authenticated using (true);

drop policy if exists news_articles_read on public.news_articles;
create policy news_articles_read on public.news_articles for select to authenticated using (true);

comment on table public.news_articles is '데이터뉴스 수집 결과 (SH_datanew_crawling 이식). 쓰기는 서비스 롤(크롤러)만.';

-- ---------------------------------------------------------
-- 6) user_news_watch — 기능6 My거래처 뉴스 알림 (개인 키워드 설정)
-- ---------------------------------------------------------
create table if not exists public.user_news_watch (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword text,
  company_name text,
  created_at timestamptz not null default timezone('utc', now()),
  check (keyword is not null or company_name is not null)
);

alter table public.user_news_watch enable row level security;

drop policy if exists user_news_watch_owner on public.user_news_watch;
create policy user_news_watch_owner on public.user_news_watch
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.user_news_watch is '회원별 관심 키워드/거래처명 (My거래처 뉴스 알림 매칭용).';

-- ---------------------------------------------------------
-- 7) kosis_shc_monthly — 기능2 KOSIS·신한카드 월별 병합 데이터 (kosis_shc.txt 대체)
-- ---------------------------------------------------------
create table if not exists public.kosis_shc_monthly (
  year_month text primary key, -- YYYYMM
  total_index numeric,         -- 총지수 (KOSIS)
  kosis_total numeric,         -- 합계 경상금액 (KOSIS)
  kosis_medicine numeric,      -- 의약품 경상금액 (KOSIS)
  shc_total numeric,           -- 신한카드_전체업종
  shc_medical numeric,         -- 신한카드_의료
  kosis_fetched_at timestamptz,
  shc_uploaded_by uuid references auth.users (id),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.kosis_shc_monthly enable row level security;

drop policy if exists kosis_shc_monthly_read on public.kosis_shc_monthly;
create policy kosis_shc_monthly_read on public.kosis_shc_monthly
  for select to authenticated using (true);

drop trigger if exists trg_kosis_shc_monthly_updated_at on public.kosis_shc_monthly;
create trigger trg_kosis_shc_monthly_updated_at before update on public.kosis_shc_monthly
  for each row execute function public.set_updated_at();

comment on table public.kosis_shc_monthly is
  'KOSIS(통계청) + 신한카드 월별 병합 지표. 관리자가 SHC 원본 parquet 업로드 시 서버가 집계 + KOSIS Open API 자동 조회로 병합.';

-- ---------------------------------------------------------
-- 7-1) kosis_shc_uploads — 기능2 신한카드 원본 parquet 메타데이터 (Google Drive)
-- ---------------------------------------------------------
create table if not exists public.kosis_shc_uploads (
  year_month text primary key, -- YYYYMM
  drive_file_id text not null,       -- Google Drive 파일 ID
  drive_file_name text,
  drive_link text,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default timezone('utc', now()),
  status text not null default 'registered' check (status in ('registered', 'processing', 'done', 'error')),
  row_count bigint,
  error_message text
);

alter table public.kosis_shc_uploads enable row level security;

drop policy if exists kosis_shc_uploads_read on public.kosis_shc_uploads;
create policy kosis_shc_uploads_read on public.kosis_shc_uploads
  for select to authenticated using (true);

comment on table public.kosis_shc_uploads is
  '신한카드 원본(월별 대분류/중분류/소분류별 취급액) parquet 메타데이터. 실제 파일은 Google Drive, 서버가 다운로드해 집계 후 kosis_shc_monthly에 반영.';

-- ---------------------------------------------------------
-- 8) dashboard_monthly_uploads / dashboard_monthly_metrics — 기능4 월별업종별 현황
-- ---------------------------------------------------------
create table if not exists public.dashboard_monthly_uploads (
  year_month text primary key, -- YYYYMM
  drive_file_id text not null,       -- Google Drive 파일 ID
  drive_file_name text,
  drive_link text,
  uploaded_by uuid references auth.users (id),
  uploaded_at timestamptz not null default timezone('utc', now()),
  status text not null default 'registered' check (status in ('registered', 'processing', 'done', 'error')),
  error_message text
);

create table if not exists public.dashboard_monthly_metrics (
  year_month text primary key references public.dashboard_monthly_uploads (year_month) on delete cascade,
  payload jsonb not null, -- dashboard_generator.py의 kpi/ry/cty/wdn/tm/age/tbl/cty_flow 구조
  row_count bigint,
  computed_at timestamptz not null default timezone('utc', now())
);

alter table public.dashboard_monthly_uploads enable row level security;
alter table public.dashboard_monthly_metrics enable row level security;

drop policy if exists dashboard_uploads_read on public.dashboard_monthly_uploads;
create policy dashboard_uploads_read on public.dashboard_monthly_uploads
  for select to authenticated using (true);

drop policy if exists dashboard_metrics_read on public.dashboard_monthly_metrics;
create policy dashboard_metrics_read on public.dashboard_monthly_metrics
  for select to authenticated using (true);

comment on table public.dashboard_monthly_uploads is
  '월별업종별 현황용 원본 parquet 메타데이터. 실제 파일은 Google Drive에 저장, 여기엔 file_id/링크만.';
comment on table public.dashboard_monthly_metrics is
  '원본 parquet을 서버가 집계한 결과 JSON 캐시. 대시보드 페이지는 이 테이블만 읽어서 즉시 렌더링.';
