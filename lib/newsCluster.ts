const STOPWORDS = new Set([
  "의", "를", "이", "가", "은", "는", "에", "와", "과", "로", "으로",
  "에서", "까지", "부터", "도", "만", "을", "한", "하는", "하여", "위해",
]);
const KEYWORDS = ["데이터", "빅데이터", "데이터사업", "트렌드", "소비"];
const NUMERIC = /\d+[\.,]?\d*\s*(%|억|만|건|명|원|개|배|회|%p|bp)/;
const TIER_SCORE: Record<string, number> = { tier1: 15, tier2: 10, tier3: 5 };

export interface ClusterArticle {
  title: string;
  url: string;
  date: string;
  summary: string;
  source_tier?: string | null;
}

function nouns(title: string) {
  const words = title.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  return new Set(words.filter((word) => !STOPWORDS.has(word)));
}

function similarity(left: string, right: string) {
  const a = nouns(left);
  const b = nouns(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function daysApart(left: string, right: string) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.abs(a - b) / 86_400_000;
}

function score(article: ClusterArticle) {
  const tier = TIER_SCORE[article.source_tier || ""] ?? 5;
  const text = `${article.title}\n${article.summary}`;
  const length = article.summary.length;
  const lengthScore = length >= 1000 ? 25 : length >= 500 ? 15 : 0;
  const keywordScore = Math.min(KEYWORDS.filter((word) => text.includes(word)).length * 5, 30);
  const numericScore = NUMERIC.test(text) ? 15 : 0;
  const linkScore = article.url.includes("n.news.naver.com") ? 10 : 5;
  return tier + lengthScore + keywordScore + numericScore + linkScore;
}

/** 주소가 같은 건 이미 제거된 목록에서, 제목이 비슷하고 3일 이내면 점수 높은 기사 하나만 남깁니다. */
export function pickUniqueStories<T extends ClusterArticle>(articles: T[]): T[] {
  const sorted = [...articles].sort((a, b) => b.date.localeCompare(a.date));
  const used = new Array(sorted.length).fill(false);
  const picked: T[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used[i]) continue;
    const cluster = [sorted[i]];
    used[i] = true;
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (used[j]) continue;
      if (
        similarity(sorted[i].title, sorted[j].title) >= 0.6
        && daysApart(sorted[i].date, sorted[j].date) <= 3
      ) {
        cluster.push(sorted[j]);
        used[j] = true;
      }
    }
    cluster.sort((a, b) => score(b) - score(a));
    picked.push(cluster[0]);
  }

  return picked;
}
