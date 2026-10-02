import Link from "next/link";

export default function AdminOverviewPage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Link
        href="/admin/api-keys"
        className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm hover:border-shinhan-blue/30 hover:shadow-md"
      >
        <h2 className="text-base font-semibold text-foreground">🔑 API 키 관리</h2>
        <p className="mt-1 text-sm text-black/55">
          KOSIS, Gemini, Naver, bizno.net, Google 서비스계정 등 각 기능에 필요한 키를 등록/수정합니다.
        </p>
      </Link>
      <Link
        href="/admin/news"
        className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm hover:border-shinhan-blue/30 hover:shadow-md"
      >
        <h2 className="text-base font-semibold text-foreground">📰 뉴스 자동수집</h2>
        <p className="mt-1 text-sm text-black/55">
          검색 키워드, 수집 주기, 메일 발송 주기와 수신 이메일을 설정하고 수집을 실행합니다.
        </p>
      </Link>
      <Link
        href="/admin/data"
        className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm hover:border-shinhan-blue/30 hover:shadow-md"
      >
        <h2 className="text-base font-semibold text-foreground">📤 데이터 업로드</h2>
        <p className="mt-1 text-sm text-black/55">
          월별 신한카드 수치(KOSIS 비교용), 월별 소비데이터 원본(Google Drive 링크)을 등록합니다.
        </p>
      </Link>
      <Link
        href="/admin/favorites"
        className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm hover:border-shinhan-blue/30 hover:shadow-md"
      >
        <h2 className="text-base font-semibold text-foreground">⭐ 즐겨찾기 설정</h2>
        <p className="mt-1 text-sm text-black/55">
          부서 공용계정 즐겨찾기의 사이트명, URL, 설명을 등록하고 수정합니다.
        </p>
      </Link>
    </div>
  );
}
