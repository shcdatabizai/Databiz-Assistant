export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-8 text-sm text-black/50 sm:px-6">
        <div className="flex items-center gap-2">
          <img
            src="/brand/logo/logo-kr-horizontal-blue.png"
            alt="신한카드"
            className="h-5 w-auto opacity-70"
          />
          <span>Databiz Assistant</span>
        </div>
      </div>
    </footer>
  );
}
