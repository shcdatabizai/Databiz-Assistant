import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-black/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/logo/logo-kr-horizontal-blue.png"
            alt="신한카드"
            width={100}
            height={27}
            className="h-5 w-auto opacity-70"
          />
          <span>데이터사업 Biz Assist</span>
        </div>
        <p>사내 전용 도구 · 데이터사업본부</p>
      </div>
    </footer>
  );
}
