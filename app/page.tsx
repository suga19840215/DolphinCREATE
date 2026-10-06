import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageAccounts } from "@/lib/core/permissions";
import { requireUser, selectableFacilities } from "@/lib/server/session";

// ログイン後の入口：見られる最初の施設（クライアント）を開く。
export default async function Home() {
  const ctx = await requireUser();
  const first = selectableFacilities(ctx)[0];
  if (first) redirect(`/f/${first.code}`);

  return (
    <div className="auth">
      <div className="authcard stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 18 }}>見られる施設がありません</h1>
        <p className="small muted">
          このアカウントには、まだ施設が割り当てられていません。本部管理者に確認してください。
        </p>
        {canManageAccounts(ctx.allRoles) ? (
          <Link className="btn pri" href="/accounts">
            アカウント・施設の管理へ
          </Link>
        ) : null}
      </div>
    </div>
  );
}
