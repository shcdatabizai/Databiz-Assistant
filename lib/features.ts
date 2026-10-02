export type FeatureStatus = "live" | "beta" | "soon";

export interface Feature {
  id: string;
  title: string;
  description: string;
  href: string;
  emoji: string;
  status: FeatureStatus;
  authRequired?: boolean;
}

export const FEATURES: Feature[] = [
  {
    id: "biz-lookup",
    title: "사업자번호 매칭/검색",
    description: "사업자번호로 기본정보·업종을 조회하고 신한카드 업종코드로 매칭합니다.",
    href: "/biz-lookup",
    emoji: "🔍",
    status: "live",
  },
  {
    id: "kosis-analysis",
    title: "KOSIS-신한카드 데이터 비교",
    description: "통계청 소매판매액과 신한카드 취급액을 비교해 제안서용 대표성 분석을 제공합니다.",
    href: "/kosis-analysis",
    emoji: "📊",
    status: "beta",
  },
  {
    id: "data-news",
    title: "데이터 관련 뉴스수집",
    description: "신한카드 데이터 관련 뉴스를 매주 자동 수집하고 요약해 보여줍니다.",
    href: "/data-news",
    emoji: "📰",
    status: "beta",
  },
  {
    id: "my-news",
    title: "My거래처 뉴스 알림",
    description: "관심 키워드·업체명을 등록하면 관련 뉴스를 개인화해 알려드립니다.",
    href: "/my-news",
    emoji: "🔔",
    status: "beta",
    authRequired: true,
  },
  {
    id: "ai-favorites",
    title: "부서 공용계정 즐겨찾기",
    description: "Claude, ChatGPT, Gemini, Zoom과 자주 방문하는 사이트 바로가기입니다.",
    href: "/ai-favorites",
    emoji: "⭐",
    status: "live",
  },
  {
    id: "monthly-dashboard",
    title: "월별 소비데이터 현황",
    description: "월별 업종별 소비 데이터를 KPI·차트로 확인하는 대시보드입니다.",
    href: "/monthly-dashboard",
    emoji: "📈",
    status: "beta",
    authRequired: true,
  },
];
