import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { userClient } from "@/lib/server/supabase";

// 招待メール・パスワード再設定メールのリンクの行き先。確認できたらパスワード設定の画面へ。
const ALLOWED: EmailOtpType[] = ["invite", "recovery"];

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const to = request.nextUrl.clone();
  to.search = "";

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await userClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      to.pathname = "/account/password";
      to.searchParams.set("mode", type);
      return NextResponse.redirect(to);
    }
  }
  to.pathname = "/login";
  to.searchParams.set("reason", "link");
  return NextResponse.redirect(to);
}
