/** 기능1(사업자번호 조회/업종매칭) 전용 타입 정의. biz_reg_no_app/lib/types.ts 이식. */

export interface InquiryResult {
  id?: number;
  brno: string;
  brno_formatted: string;
  company_name: string;
  query_date: string;
  is_cached: boolean;
  api: {
    bizno: BiznoAPIResult | null;
    gov: GovAPIResult | null;
  };
  crawl: CrawlResult | null;
  ftc: FTCResult | null;
  mapping?: CategoryMapping;
}

export interface BiznoAPIResult {
  success: boolean;
  found: boolean;
  message?: string;
  items?: BiznoItem[];
  raw?: unknown;
}

export interface BiznoItem {
  상호명: string;
  사업자등록번호: string;
  법인등록번호: string;
  사업자상태: string;
  사업자상태코드: string;
  과세유형: string;
  폐업일: string;
}

export interface GovAPIResult {
  success: boolean;
  found: boolean;
  message?: string;
  items?: Record<string, string>[];
  raw?: unknown;
}

export interface CrawlResult {
  success: boolean;
  found?: boolean;
  search?: Record<string, string>;
  detail?: Record<string, unknown>;
}

export interface FTCResult {
  success: boolean;
  found: boolean;
  message?: string;
  year?: number;
  가맹본부?: Record<string, string>;
  브랜드?: FTCBrand[];
}

export interface FTCBrand {
  브랜드관리번호: string;
  브랜드명: string;
  산업대분류: string;
  산업중분류: string;
  주요상품: string;
  가맹개시일자: string;
}

export interface CategoryMapping {
  mct_ry_cd?: CategoryCode;
  hpsn_mct_zcd?: CategoryCode;
  reasoning?: string;
}

export interface CategoryCode {
  code: string;
  name: string;
}

export interface Categories {
  mct_ry_cd: Record<string, string>;
  hpsn_mct_zcd: Record<string, string>;
}
