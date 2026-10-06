import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { PasswordForm } from "./password-form";

const TITLE: Record<string, string> = {
  invite: "パスワードを設定してください",
  recovery: "新しいパスワードを設定してください",
};

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const supabase = await userClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  const mode = (await searchParams).mode ?? "change";
  // ログイン中の変更は、有効なセッション（多要素認証済み）でだけ
  if (!(mode in TITLE)) await requireUser();

  return (
    <div className="auth">
      <div className="authcard stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 18 }}>{TITLE[mode] ?? "パスワードの変更"}</h1>
        <p className="small muted" style={{ margin: 0 }}>
          12文字以上で、ほかのサービスで使っていないものにしてください。過去に漏えいしたパスワードは使えません。設定後は新しいパスワードでログインし直します。
        </p>
        <PasswordForm />
        {mode === "change" ? (
          <Link className="small" href="/">
            やめて戻る
          </Link>
        ) : null}
      </div>
    </div>
  );
}
