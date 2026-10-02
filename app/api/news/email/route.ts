import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCurrentUser } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";
import { buildNewsMailText, type NewsMailArticle } from "@/lib/newsMail";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 후 메일을 보낼 수 있습니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const articles = Array.isArray(body?.articles) ? (body.articles as NewsMailArticle[]) : [];
  if (!email.includes("@")) {
    return NextResponse.json({ error: "메일 주소를 입력해주세요." }, { status: 400 });
  }
  const picked = articles.filter((article) => article.title && article.url).slice(0, 30);
  if (picked.length === 0) {
    return NextResponse.json({ error: "보낼 기사를 선택해주세요." }, { status: 400 });
  }

  const username = await resolveApiKey("SMTP_USERNAME", user.id);
  const password = await resolveApiKey("SMTP_PASSWORD", user.id);
  if (!username || !password) {
    return NextResponse.json(
      { error: "SMTP 계정이 없습니다. 관리자 API 키 관리에서 메일 계정을 등록해주세요." },
      { status: 400 }
    );
  }

  const edited = typeof body?.text === "string" ? body.text.trim() : "";
  const text = edited ? edited.slice(0, 50000) : buildNewsMailText(picked);

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_SERVER || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: username, pass: password.replace(/ /g, "") },
    });
    await transport.sendMail({
      from: username,
      to: email,
      subject: `데이터뉴스 선택 기사 ${picked.length}건`,
      text,
    });
  } catch (error) {
    return NextResponse.json({ error: `메일 발송 실패: ${(error as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: `${email} 으로 ${picked.length}건을 보냈습니다.` });
}
