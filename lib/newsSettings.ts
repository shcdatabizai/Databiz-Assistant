export const NEWS_SETTINGS_KEY = "NEWS_CRAWL_SETTINGS";

export const DEFAULT_NEWS_KEYWORDS = [
  "신한카드 빅데이터",
  "신한카드 데이터사업",
  "신한카드 소비트렌드",
  "신한카드 데이터 트렌드",
  "신한카드 데이터",
  "신한카드 소비",
];

export type CollectInterval = "daily" | "weekly" | "monthly";
export type EmailInterval = "off" | "after_crawl" | "daily" | "weekly";

export interface NewsCrawlSettings {
  keywords: string[];
  collectInterval: CollectInterval;
  collectDays: number;
  emailInterval: EmailInterval;
  recipientEmails: string[];
}

export const DEFAULT_NEWS_SETTINGS: NewsCrawlSettings = {
  keywords: DEFAULT_NEWS_KEYWORDS,
  collectInterval: "weekly",
  collectDays: 7,
  emailInterval: "weekly",
  recipientEmails: [],
};

const COLLECT_INTERVALS = new Set<CollectInterval>(["daily", "weekly", "monthly"]);
const EMAIL_INTERVALS = new Set<EmailInterval>(["off", "after_crawl", "daily", "weekly"]);

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function parseNewsSettings(raw: string | null | undefined): NewsCrawlSettings {
  if (!raw) return { ...DEFAULT_NEWS_SETTINGS, keywords: [...DEFAULT_NEWS_KEYWORDS] };
  try {
    const data = JSON.parse(raw) as Partial<NewsCrawlSettings>;
    return normalizeNewsSettings(data);
  } catch {
    return { ...DEFAULT_NEWS_SETTINGS, keywords: [...DEFAULT_NEWS_KEYWORDS] };
  }
}

export function normalizeNewsSettings(input: Partial<NewsCrawlSettings>): NewsCrawlSettings {
  const keywords = asStringList(input.keywords);
  const recipientEmails = asStringList(input.recipientEmails).filter((email) => email.includes("@"));
  const days = Number(input.collectDays);
  const collectInterval = COLLECT_INTERVALS.has(input.collectInterval as CollectInterval)
    ? (input.collectInterval as CollectInterval)
    : DEFAULT_NEWS_SETTINGS.collectInterval;
  const emailInterval = EMAIL_INTERVALS.has(input.emailInterval as EmailInterval)
    ? (input.emailInterval as EmailInterval)
    : DEFAULT_NEWS_SETTINGS.emailInterval;

  return {
    keywords: keywords.length > 0 ? keywords : [...DEFAULT_NEWS_KEYWORDS],
    collectInterval,
    collectDays: Number.isFinite(days) ? Math.min(90, Math.max(1, Math.round(days))) : DEFAULT_NEWS_SETTINGS.collectDays,
    emailInterval,
    recipientEmails,
  };
}
