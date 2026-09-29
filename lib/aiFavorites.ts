export interface AiFavoriteLink {
  id: "claude" | "chatgpt" | "gemini" | "zoom";
  name: string;
  url: string;
  color: string;
}

export const AI_FAVORITE_LINKS: AiFavoriteLink[] = [
  { id: "claude", name: "Claude", url: "https://claude.ai", color: "#D97757" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com", color: "#000000" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com", color: "#8E75B2" },
  { id: "zoom", name: "Zoom", url: "https://zoom.us", color: "#0B5CFF" },
];
