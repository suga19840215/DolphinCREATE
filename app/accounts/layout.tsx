import Link from "next/link";
import { logout } from "@/app/login/actions";
import { requireUser, selectableFacilities } from "@/lib/server/session";

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const first = selectableFacilities(ctx)[0];
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <b>Dolphin</b>
          <span>CREATE</span>
        </div>
        <nav className="nav" aria-label="メニュー">
          {first ? (
            <Link href={`/f/${first.code}`}>
              <span className="n">←</span>
              施設の画面へ戻る
            </Link>
          ) : null}
          <div className="sep" />
          <Link href="/accounts" aria-current="page">
            <span className="n">ID</span>
            アカウント管理
          </Link>
        </nav>
      </aside>
      <main className="main">
        <div className="top">
          <div className="who" style={{ borderLeft: 0, paddingLeft: 0 }}>
            <span className="tiny">ログイン中</span>
            <b>{ctx.displayName}</b>
          </div>
          <div className="row end" style={{ gap: 6 }}>
            <a className="btn" href="/account/password">
              パスワード変更
            </a>
            <form action={logout}>
              <button className="btn" type="submit">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
