import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** Google 등 OAuth 리다이렉트 콜백. code를 세션으로 교환한다. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const next = safeNext(url.searchParams.get("next"));

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  if (oauthError) {
    const reason = encodeURIComponent(oauthError.slice(0, 180));
    return NextResponse.redirect(`${origin}/login?error=google_login_failed&reason=${reason}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const reason = encodeURIComponent(error.message.slice(0, 180));
    return NextResponse.redirect(`${origin}/login?error=google_login_failed&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}/login?error=google_login_failed`);
}
