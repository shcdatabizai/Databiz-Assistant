export const MY_NEWS_SETTINGS_KEY = "__settings__";

export interface MyNewsSettings {
  autoCollect: boolean;
  interval: "weekly" | "daily";
  autoEmail: boolean;
  email: string;
}

export const DEFAULT_MY_NEWS_SETTINGS: MyNewsSettings = {
  autoCollect: false,
  interval: "weekly",
  autoEmail: false,
  email: "",
};

export function parseMyNewsSettings(raw: string | null | undefined): MyNewsSettings {
  if (!raw) return DEFAULT_MY_NEWS_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<MyNewsSettings>;
    return {
      autoCollect: !!parsed.autoCollect,
      interval: parsed.interval === "daily" ? "daily" : "weekly",
      autoEmail: !!parsed.autoEmail,
      email: typeof parsed.email === "string" ? parsed.email.trim() : "",
    };
  } catch {
    return DEFAULT_MY_NEWS_SETTINGS;
  }
}

export function splitWatchTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const part of text.split(/[\n;]/)) {
    const value = part.trim();
    const key = value.toLowerCase();
    if (!value || value === MY_NEWS_SETTINGS_KEY || seen.has(key)) continue;
    seen.add(key);
    terms.push(value);
  }
  return terms;
}
