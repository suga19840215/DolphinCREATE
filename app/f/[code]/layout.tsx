import { logout } from "@/app/login/actions";
import { FacilitySwitcher } from "@/app/components/facility-switcher";
import { SideNav } from "@/app/components/side-nav";
import { ROLE_LABEL, canManageAccounts } from "@/lib/core/permissions";
import { requireFacility, selectableFacilities } from "@/lib/server/session";

export default async function FacilityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { ctx, facility, roles } = await requireFacility(code);
  const options = selectableFacilities(ctx).map(({ code, name, sub }) => ({ code, name, sub }));

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <b>Dolphin</b>
          <span>CREATE</span>
        </div>
        <SideNav code={facility.code} showAccounts={canManageAccounts(ctx.allRoles)} />
      </aside>
      <main className="main">
        <div className="top">
          <FacilitySwitcher current={facility.code} options={options} />
          <div className="who">
            <span className="tiny">ログイン中</span>
            <b>{ctx.displayName}</b>
            <span className="tiny">{roles.map((r) => ROLE_LABEL[r]).join("・")}</span>
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
