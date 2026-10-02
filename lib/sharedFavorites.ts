export type FavoriteSection = "ai" | "sites";
export type FavoriteIcon = "claude" | "chatgpt" | "gemini" | "zoom" | "favicon";

export interface SharedFavorite {
  id: string;
  section: FavoriteSection;
  name: string;
  url: string;
  description: string;
  icon: FavoriteIcon;
}

export const SHARED_FAVORITES_KEY = "SHARED_FAVORITES";

export const FAVORITE_SECTIONS: { id: FavoriteSection; title: string; emoji: string }[] = [
  { id: "ai", title: "AI·회의서비스", emoji: "✨" },
  { id: "sites", title: "자주 방문하는 사이트", emoji: "🔗" },
];

const LOGIN_SHC = "로그인 ID : shc.databizai@shinhan.com";
const LOGIN_ZOOM = "로그인 ID : databiz.shc@gmail.com";

export const DEFAULT_SHARED_FAVORITES: SharedFavorite[] = [
  {
    id: "claude",
    section: "ai",
    name: "Claude",
    url: "https://claude.ai",
    description: LOGIN_SHC,
    icon: "claude",
  },
  {
    id: "chatgpt",
    section: "ai",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    description: LOGIN_SHC,
    icon: "chatgpt",
  },
  {
    id: "gemini",
    section: "ai",
    name: "Gemini",
    url: "https://gemini.google.com",
    description: LOGIN_SHC,
    icon: "gemini",
  },
  {
    id: "zoom",
    section: "ai",
    name: "Zoom",
    url: "https://zoom.us",
    description: LOGIN_ZOOM,
    icon: "zoom",
  },
  {
    id: "databada",
    section: "sites",
    name: "데이터바다",
    url: "https://databada.shinhancard.com",
    description: "",
    icon: "favicon",
  },
];

export function inferFavoriteIcon(url: string): FavoriteIcon {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("claude.ai")) return "claude";
    if (host.endsWith("chatgpt.com") || host.endsWith("openai.com")) return "chatgpt";
    if (host.endsWith("gemini.google.com")) return "gemini";
    if (host.endsWith("zoom.us")) return "zoom";
  } catch {
    return "favicon";
  }
  return "favicon";
}

export function favoriteIconUrl(item: Pick<SharedFavorite, "url" | "icon">): string {
  if (item.icon !== "favicon") return "";
  try {
    return `${new URL(item.url).origin}/favicon.ico`;
  } catch {
    return "";
  }
}

export function normalizeFavorites(input: unknown): SharedFavorite[] {
  if (!Array.isArray(input)) return [];
  const items: SharedFavorite[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const section = record.section === "sites" ? "sites" : record.section === "ai" ? "ai" : null;
    if (!name || !section || !/^https?:\/\//i.test(url)) continue;
    const icon = inferFavoriteIcon(url);
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : crypto.randomUUID();
    const description = typeof record.description === "string" ? record.description.trim() : "";
    items.push({ id, section, name, url, description, icon });
  }
  return items;
}

export function parseSharedFavorites(raw: string | null): SharedFavorite[] {
  if (!raw) return DEFAULT_SHARED_FAVORITES.map((item) => ({ ...item }));
  try {
    return normalizeFavorites(JSON.parse(raw));
  } catch {
    return DEFAULT_SHARED_FAVORITES.map((item) => ({ ...item }));
  }
}
