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
    usage: "[기능1] 사업자번호로 기본정보(상호/업태/개업일 등)를 조회합니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GOV_API_KEY_DECODED",
    label: "공공데이터포털 API 키 (Decoding)",
    usage:
      "[기능1] 통신판매/전자상거래 사업자 정보를 data.go.kr에서 조회합니다. (공통) 공공데이터포털 같은 계정이면 아래 [기능4] 특일정보 API 키(HOLIDAY_API_KEY)와 동일한 값을 사용할 수 있습니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GOV_API_KEY_ENCODED",
    label: "공공데이터포털 API 키 (Encoding)",
    usage: "[기능1] 위와 동일 API의 URL-Encoding 버전 키입니다.",
    group: "사업자번호 매칭",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini API 키",
    usage: "[기능1,3 공통] 기능1의 업종 매핑 LLM 분석과 기능3의 뉴스 요약 보조가 동일 키를 함께 사용합니다.",
    group: "AI / LLM",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic Claude API 키",
    usage: "[기능3] 수집된 뉴스 기사를 요약·클러스터링합니다.",
    group: "AI / LLM",
  },
  {
    key: "KOSIS_API_KEY",
    label: "통계청 KOSIS Open API 키",
    usage: "[기능2] 소매판매액지수/판매액 통계를 조회해 신한카드 데이터와 비교합니다.",
    group: "KOSIS-신한카드 비교",
  },
  {
    key: "NAVER_CLIENT_ID",
    label: "네이버 검색 API Client ID",
    usage: "[기능3] 신한카드 데이터 관련 뉴스를 검색합니다.",
    group: "데이터뉴스 수집",
  },
  {
    key: "NAVER_CLIENT_SECRET",
    label: "네이버 검색 API Client Secret",
    usage: "[기능3] 위 Client ID와 함께 사용하는 비밀키입니다.",
    group: "데이터뉴스 수집",
  },
  {
    key: "GITHUB_PAT",
    label: "GitHub Personal Access Token",
    usage: "[기능3] 주간 뉴스 크롤링 GitHub Actions 워크플로우를 트리거합니다. 'repo' 및 'workflow' 권한이 필요합니다.",
    group: "데이터뉴스 수집",
  },
  {
    key: "GITHUB_REPO",
    label: "GitHub 저장소 (owner/repo)",
    usage: "[기능3] weekly_news_crawl.yml 워크플로우가 있는 GitHub 저장소입니다. 예: myorg/DataBiz_Assist",
    group: "데이터뉴스 수집",
  },
  {
    key: "GOOGLE_SERVICE_ACCOUNT_JSON",
    label: "Google 서비스 계정 JSON",
    usage:
      "[기능2,4 공통] 관리자 Google Drive에 공유된 폴더에서 월별 parquet 원본 파일(신한카드 취급액 · 대시보드 소비데이터)을 읽기전용으로 다운로드합니다.",
    group: "월별 소비데이터 현황",
  },
  {
    key: "HOLIDAY_API_KEY",
    label: "공공데이터포털 특일정보 API 키",
    usage:
      "[기능4] 대시보드의 주차별 공휴일 정보를 조회합니다. (공통) 공공데이터포털 같은 계정이면 위 [기능1] GOV_API_KEY_DECODED와 동일한 값을 사용할 수 있습니다.",
    group: "월별 소비데이터 현황",
  },
  {
    key: "SMTP_USERNAME",
    label: "SMTP 계정 (이메일)",
    usage: "[기능1,3 공통] 사업자번호 조회 결과(기능1)와 뉴스 수집 결과(기능3) 발송 메일이 동일 계정을 함께 사용합니다.",
    group: "이메일 발송",
  },
  {
    key: "SMTP_PASSWORD",
    label: "SMTP 비밀번호(앱 비밀번호)",
    usage: "[기능1,3 공통] 위 SMTP 계정의 인증 비밀번호이며, 기능1·기능3이 동일 값을 함께 사용합니다.",
    group: "이메일 발송",
  },
];

export const API_KEY_GROUPS = Array.from(new Set(API_KEY_DEFS.map((d) => d.group)));
