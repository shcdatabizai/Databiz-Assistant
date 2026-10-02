export interface ApiKeyDef {
  key: string;
  label: string;
  usage: string;
  placeholder?: string;
  group: string;
}

export const API_KEY_DEFS: ApiKeyDef[] = [
  {
    key: "BIZNO_API_KEY",
    label: "bizno.net API 키",
    usage: "사업자번호로 기본정보(상호, 업태, 개업일)를 조회합니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GOV_API_KEY_DECODED",
    label: "공공데이터포털 API 키 (Decoding)",
    usage:
      "통신판매, 전자상거래 사업자 정보를 data.go.kr에서 조회합니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GOV_API_KEY_ENCODED",
    label: "공공데이터포털 API 키 (Encoding)",
    usage: "위와 같은 API의 URL-Encoding 버전 키입니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini API 키",
    usage: "업종 매핑 분석과 뉴스 요약 보조가 같은 키를 사용합니다.",
    group: "AI / LLM",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic Claude API 키",
    usage: "수집된 뉴스 기사를 요약하고 묶습니다.",
    group: "AI / LLM",
  },
  {
    key: "KOSIS_API_KEY",
    label: "통계청 KOSIS Open API 키",
    usage: "소매판매액지수와 판매액 통계를 조회해 신한카드 데이터와 비교합니다.",
    group: "KOSIS-신한카드 비교",
  },
  {
    key: "NAVER_CLIENT_ID",
    label: "네이버 검색 API Client ID",
    usage: "신한카드 데이터 관련 뉴스를 검색합니다.",
    group: "데이터뉴스 수집",
  },
  {
    key: "NAVER_CLIENT_SECRET",
    label: "네이버 검색 API Client Secret",
    usage: "위 Client ID와 함께 사용하는 비밀키입니다.",
    group: "데이터뉴스 수집",
  },
  {
    key: "GOOGLE_SERVICE_ACCOUNT_JSON",
    label: "Google 서비스 계정 JSON",
    usage:
      "Google Drive에 공유된 폴더의 parquet 원본을 읽습니다. JSON 파일은 Google Cloud Console의 서비스 계정 → 키 → 키 추가 → 새 키 만들기 → JSON에서 받습니다.",
    group: "월별 소비데이터 현황",
  },
  {
    key: "SMTP_USERNAME",
    label: "SMTP 계정 (이메일)",
    usage: "사업자번호 조회 결과와 뉴스 수집 결과를 보내는 메일 계정입니다.",
    group: "이메일 발송",
  },
  {
    key: "SMTP_PASSWORD",
    label: "SMTP 비밀번호(앱 비밀번호)",
    usage: "위 SMTP 계정의 인증 비밀번호입니다. 사업자 조회 메일과 뉴스 메일이 같은 값을 사용합니다.",
    group: "이메일 발송",
  },
];

export const API_KEY_GROUPS = Array.from(new Set(API_KEY_DEFS.map((d) => d.group)));

/** 뉴스 수집 화면에서만 등록합니다. API 키 관리 목록에는 넣지 않습니다. */
export const NEWS_GITHUB_KEY_DEFS: ApiKeyDef[] = [
  {
    key: "GITHUB_PAT",
    label: "GitHub Personal Access Token",
    usage: "",
    group: "뉴스 수집",
  },
  {
    key: "GITHUB_REPO",
    label: "GitHub 저장소 (owner/repo)",
    usage: "자동 수집을 실행할 .yml 파일이 저장된 저장소를 지정합니다. shcdatabizai/Databiz-Assistant",
    placeholder: "shcdatabizai/Databiz-Assistant",
    group: "뉴스 수집",
  },
];

export const STORED_KEY_DEFS = [...API_KEY_DEFS, ...NEWS_GITHUB_KEY_DEFS];
