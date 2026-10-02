const PRESS_CODE: Record<string, string> = {
  "001": "연합뉴스",
  "002": "연합뉴스",
  "003": "뉴시스",
  "005": "국민일보",
  "009": "매일경제",
  "011": "서울경제",
  "018": "이데일리",
  "020": "동아일보",
  "021": "경향신문",
  "022": "세계일보",
  "023": "중앙일보",
  "025": "한국일보",
  "028": "한겨레",
  "030": "전자신문",
  "031": "머니투데이",
  "032": "매일경제",
  "033": "한국경제",
  "037": "파이낸셜뉴스",
  "081": "서울신문",
  "421": "문화일보",
};

const HOST_PRESS: [string, string][] = [
  ["yna.co.kr", "연합뉴스"],
  ["yonhapnews.co.kr", "연합뉴스"],
  ["newsis.com", "뉴시스"],
  ["news1.kr", "뉴스1"],
  ["kbs.co.kr", "KBS"],
  ["imbc.com", "MBC"],
  ["sbs.co.kr", "SBS"],
  ["jtbc.co.kr", "JTBC"],
  ["ytn.co.kr", "YTN"],
  ["mbn.co.kr", "MBN"],
  ["mk.co.kr", "매일경제"],
  ["hankyung.com", "한국경제"],
  ["mt.co.kr", "머니투데이"],
  ["edaily.co.kr", "이데일리"],
  ["fnnews.com", "파이낸셜뉴스"],
  ["asiae.co.kr", "아시아경제"],
  ["sedaily.com", "서울경제"],
  ["heraldcorp.com", "헤럴드경제"],
  ["bizwatch.co.kr", "비즈워치"],
  ["chosunbiz.com", "조선비즈"],
  ["khan.co.kr", "경향신문"],
  ["kmib.co.kr", "국민일보"],
  ["donga.com", "동아일보"],
  ["munhwa.com", "문화일보"],
  ["seoul.co.kr", "서울신문"],
  ["segye.com", "세계일보"],
  ["chosun.com", "조선일보"],
  ["joongang.co.kr", "중앙일보"],
  ["joins.com", "중앙일보"],
  ["hani.co.kr", "한겨레"],
  ["hankookilbo.com", "한국일보"],
  ["dt.co.kr", "디지털타임스"],
  ["etnews.com", "전자신문"],
  ["zdnet.co.kr", "지디넷코리아"],
  ["inews24.com", "아이뉴스24"],
  ["bloter.net", "블로터"],
  ["ddaily.co.kr", "디지털데일리"],
  ["nocutnews.co.kr", "노컷뉴스"],
  ["tf.co.kr", "더팩트"],
  ["dailian.co.kr", "데일리안"],
  ["mediatoday.co.kr", "미디어오늘"],
  ["ohmynews.com", "오마이뉴스"],
  ["pressian.com", "프레시안"],
];

const TIER1 = new Set([
  "연합뉴스", "뉴시스", "뉴스1", "연합뉴스TV", "KBS", "MBC", "SBS", "JTBC", "YTN",
  "채널A", "TV조선", "MBN", "한국경제TV", "SBS Biz",
  "매일경제", "한국경제", "머니투데이", "이데일리", "파이낸셜뉴스", "아시아경제", "서울경제",
  "헤럴드경제", "비즈워치", "조선비즈", "조세일보",
  "경향신문", "국민일보", "동아일보", "문화일보", "서울신문", "세계일보", "조선일보", "중앙일보",
  "한겨레", "한국일보",
  "디지털타임스", "전자신문", "블로터", "디지털데일리", "지디넷코리아", "아이뉴스24",
]);

const TIER2 = new Set([
  "노컷뉴스", "더팩트", "데일리안", "미디어오늘", "오마이뉴스", "프레시안",
  "매경이코노미", "한경비즈니스", "이코노미스트", "시사저널", "시사IN", "주간동아", "주간조선",
  "중앙SUNDAY", "한겨레21", "더스쿠프", "레이디경향", "주간경향", "신동아", "월간 산",
  "뉴스타파", "코리아헤럴드", "코리아중앙데일리", "동아사이언스", "기자협회보", "농민신문",
  "여성신문", "일다", "코메디닷컴", "헬스조선",
]);

const TIER3 = new Set([
  "강원도민일보", "강원일보", "경기일보", "국제신문", "대구MBC", "대전일보", "매일신문",
  "부산일보", "전주MBC", "CJB청주방송", "JIBS", "kbc광주방송",
]);

export function pressFromUrl(url: string) {
  const code = url.match(/\/article\/(\d{3})\//)?.[1];
  if (code && PRESS_CODE[code]) return PRESS_CODE[code];
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const found = HOST_PRESS.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
    return found?.[1] ?? "";
  } catch {
    return "";
  }
}

export function sourceTier(source: string) {
  const name = source.trim();
  if (!name) return "unknown";
  if (TIER1.has(name)) return "tier1";
  if (TIER2.has(name)) return "tier2";
  if (TIER3.has(name)) return "tier3";
  return "unknown";
}

export function resolvePress(urls: string[], source = "") {
  const named = source.trim() || urls.map(pressFromUrl).find(Boolean) || "";
  return { source: named, source_tier: sourceTier(named) };
}
