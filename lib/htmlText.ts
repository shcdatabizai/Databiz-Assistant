/** Naver 뉴스 제목에 남는 HTML 엔티티를 화면용 문자로 바꿉니다. */
export function decodeHtmlText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
