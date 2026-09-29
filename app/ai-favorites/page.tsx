import { AI_FAVORITE_LINKS } from "@/lib/aiFavorites";
import { ClaudeLogo, ChatGptLogo, GeminiLogo, ZoomLogo } from "@/components/icons/ServiceLogos";
import { Card, CardContent } from "@/components/ui/card";

const LOGO_MAP = {
  claude: ClaudeLogo,
  chatgpt: ChatGptLogo,
  gemini: GeminiLogo,
  zoom: ZoomLogo,
} as const;

export default function AiFavoritesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          부서 공용계정 즐겨찾기
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-black/55 sm:text-base">
          부서에서 사용하는 AI 서비스 바로가기 모음입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AI_FAVORITE_LINKS.map((link) => {
          const Logo = LOGO_MAP[link.id];
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="flex items-center gap-4 pt-6">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl p-2.5"
                    style={{ backgroundColor: link.color }}
                  >
                    <Logo className="h-full w-full" />
                  </span>
                  <div className="flex flex-1 items-center gap-1.5">
                    <h2 className="text-base font-semibold text-foreground group-hover:text-shinhan-blue">
                      {link.name}
                    </h2>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-black/30 group-hover:text-shinhan-blue"
                    >
                      <path d="M7 17L17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </CardContent>
              </Card>
            </a>
          );
        })}
      </div>

      <div className="mt-8 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        ⚠️ 계정 정보는 별도로 부서내 공유된 계정정보를 확인해주세요.
      </div>
    </div>
  );
}
