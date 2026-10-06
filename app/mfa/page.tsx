import { redirect } from "next/navigation";
import { logout } from "@/app/login/actions";
import { endExpiredSession, getSession } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { MfaForm } from "./mfa-form";

// 本部管理者・施設管理者は多要素認証（認証アプリ）が必須（本番設計）。
export default async function MfaPage() {
  const session = await getSession();
  if (session === null) redirect("/login");
  if (session === "expired") return endExpiredSession();
  if (session.mfaSatisfied) redirect("/");

  const supabase = await userClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");

  let body: React.ReactNode;
  if (verified) {
    body = (
      <>
        <p className="small muted">認証アプリに表示されている6桁の確認コードを入力してください。</p>
        <MfaForm factorId={verified.id} mode="verify" />
      </>
    );
  } else {
    // 途中でやめた登録は消してから、新しく登録する
    for (const f of factors?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Dolphin CREATE ${new Date().toISOString().slice(0, 10)}`,
    });
    body =
      error || !enrolled ? (
        <p className="notice bad">
          認証アプリの登録を始められませんでした。時間をおいてもう一度開いてください。
        </p>
      ) : (
        <>
          <p className="small muted">
            この権限では多要素認証が必要です。スマートフォンの認証アプリ（Google
            Authenticator、Microsoft Authenticator など）で下の QR
            コードを読み取り、表示された6桁の確認コードを入力してください。
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- 認証サービスが返す SVG をそのまま表示する */}
          <img
            src={enrolled.totp.qr_code}
            alt="認証アプリに登録する QR コード"
            width={180}
            height={180}
            style={{ background: "#fff", borderRadius: 8, padding: 8 }}
          />
          <p className="tiny">
            読み取れないときは、このキーを手入力してください：
            <span className="num" style={{ userSelect: "all" }}>
              {enrolled.totp.secret}
            </span>
          </p>
          <MfaForm factorId={enrolled.id} mode="enroll" />
        </>
      );
  }

  return (
    <div className="auth">
      <div className="authcard stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 18 }}>{verified ? "確認コードの入力" : "多要素認証の登録"}</h1>
        {body}
        <form action={logout}>
          <button className="btn" type="submit">
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
