import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { LoginForm } from "./login-form";

const REASON: Record<string, { kind: "good" | "warn"; text: string }> = {
  logout: { kind: "good", text: "ログアウトしました。" },
  expired: {
    kind: "warn",
    text: "30分間操作がなかったか、ログインから12時間たったため、自動でログアウトしました。もう一度ログインしてください。",
  },
  password: {
    kind: "good",
    text: "パスワードを設定しました。新しいパスワードでログインしてください。",
  },
  link: {
    kind: "warn",
    text: "メールのリンクが無効か、有効期限が切れています。施設管理者（施設管理者の方は本部）に再送を依頼してください。",
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getSession();
  if (session && session !== "expired") redirect("/");
  const reason = REASON[(await searchParams).reason ?? ""];

  return (
    <div className="auth">
      <div className="authcard">
        <div className="brand" style={{ padding: 0, marginBottom: 6 }}>
          <b>Dolphin</b>
          <span>CREATE</span>
        </div>
        <p className="small muted" style={{ margin: "0 0 16px" }}>
          メールアドレスとパスワードでログインしてください。
        </p>
        {reason ? (
          <p className={`notice ${reason.kind}`} role="status" style={{ marginTop: 0 }}>
            {reason.text}
          </p>
        ) : null}
        <LoginForm />
        <p className="tiny" style={{ margin: "16px 0 0", lineHeight: 1.7 }}>
          アカウントは招待制です。パスワードを忘れたときやロックされたときは、施設管理者（施設管理者の方は本部）に連絡してください。
        </p>
      </div>
    </div>
  );
}
