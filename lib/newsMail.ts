export interface NewsMailArticle {
  title?: string | null;
  url?: string | null;
  source?: string | null;
  summary?: string | null;
}

function summaryText(summary: string) {
  return summary
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildNewsMailText(articles: NewsMailArticle[]) {
  const blocks = articles.map((article, index) => {
    const title = (article.title || "").trim();
    const source = (article.source || "").trim();
    const url = (article.url || "").trim();
    const summary = summaryText(article.summary || "");
    const head = `${title}${source ? ` (${source})` : ""}`;
    return [`기사${index + 1}.`, head, url, summary].filter(Boolean).join("\n\n");
  });
  return [`선택한 데이터뉴스 ${articles.length}건입니다.`, "", blocks.join("\n\n\n")].join("\n").trim();
}
