import Link from "next/link";
import { isInactiveCandidate } from "@/lib/core/accounts";
import { isLocked, needsAdminUnlock } from "@/lib/core/lockout";
import { ROLE_LABEL, canManageUser } from "@/lib/core/permissions";
import { userClient } from "@/lib/server/supabase";
import { sendPasswordReset, setSuspended, unlockUser } from "./actions";
import { loadAccounts, requireAccountManager, type AccountRow } from "./data";
import { FacilityForm } from "./facility-form";
import { InviteForm } from "./invite-form";

const EVENT_LABEL: Record<string, string> = {
  login_succeeded: "ログイン",
  login_failed: "ログイン失敗",
  login_locked: "ロック中のログイン",
  locked_out: "5回失敗でロック",
  logout: "ログアウト",
  auto_logout: "自動ログアウト",
  mfa_enrolled: "多要素認証を登録",
  mfa_verified: "多要素認証",
  mfa_failed: "多要素認証の失敗",
  password_changed: "パスワード設定",
  password_reset_sent: "再設定メール送信",
  invited: "招待",
  roles_changed: "権限変更",
  profile_changed: "氏名変更",
  suspended: "停止",
  resumed: "再開",
  unlocked: "ロック解除",
};
const GOOD_EVENTS = new Set([
  "login_succeeded",
  "logout",
  "mfa_enrolled",
  "mfa_verified",
  "password_changed",
  "invited",
  "resumed",
  "unlocked",
]);

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function StatusPill({ u, now }: { u: AccountRow; now: Date }) {
  const lock = {
    failedLoginCount: u.failed_login_count,
    lockedUntil: u.locked_until ? new Date(u.locked_until) : null,
    lockCount: u.lock_count,
  };
  if (u.status === "suspended") return <span className="pill">停止中</span>;
  if (u.status === "invited") return <span className="pill sky">招待中</span>;
  if (isLocked(lock, now))
    return (
      <span className="pill bad">
        {needsAdminUnlock(lock) ? "ロック中（解除が必要）" : "ロック中（15分）"}
      </span>
    );
  if (isInactiveCandidate(u.last_login_at, u.created_at, now))
    return <span className="pill warn">停止候補（90日未使用）</span>;
  return <span className="pill good">有効</span>;
}

export default async function AccountsPage() {
  const { ctx, facilities } = await requireAccountManager();
  const accounts = await loadAccounts();
  const now = new Date();
  const isHqAdmin = facilities.some((f) => f.kind === "hq");

  const supabase = await userClient();
  const [{ data: venues }, { data: history }] = await Promise.all([
    supabase.from("facility").select("id, code, name, sub").eq("kind", "venue").order("code"),
    supabase
      .from("auth_audit")
      .select(
        "id, at, event, email_entered, user:user_id (display_name, email), facility:facility_id (code)",
      )
      .order("at", { ascending: false })
      .limit(100),
  ]);

  const actorRolesAt = (facilityId: string) => ctx.rolesByFacility.get(facilityId)?.roles ?? [];

  return (
    <div className="stack">
      <div>
        <h1>アカウント管理</h1>
        <p className="lead">
          {isHqAdmin
            ? "全施設のアカウントを発行・変更・停止できます。"
            : "自施設の会場担当・閲覧のみのアカウントを発行・停止できます。施設管理者の発行は本部が行います。"}
          共用アカウントは作らず、1人1アカウントにしてください。異動・退職のときは当日中に停止してください。
        </p>
      </div>

      <section className="panel">
        <h2>アカウント一覧</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>氏名</th>
                <th>メールアドレス</th>
                <th>所属</th>
                <th>権限</th>
                <th>状態</th>
                <th>最終ログイン</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((u) => {
                const manageable =
                  u.id !== ctx.userId &&
                  canManageUser(
                    actorRolesAt(u.facility.id),
                    u.roles.map((r) => r.role),
                  );
                const lockedNow = u.locked_until !== null && new Date(u.locked_until) > now;
                const roleText = [...new Set(u.roles.map((r) => ROLE_LABEL[r.role]))].join("・");
                const venuesText =
                  u.facility.kind === "hq" && !u.roles.some((r) => r.role === "hq_admin")
                    ? [...new Set(u.roles.map((r) => r.facility.name))].join("・")
                    : "";
                return (
                  <tr key={u.id} data-email={u.email}>
                    <td>{u.display_name}</td>
                    <td className="num small">{u.email}</td>
                    <td>{u.facility.name}</td>
                    <td className="small">
                      {roleText || "—"}
                      {venuesText ? (
                        <span className="tiny" style={{ display: "block" }}>
                          担当：{venuesText}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <StatusPill u={u} now={now} />
                    </td>
                    <td className="num small">{fmt(u.last_login_at)}</td>
                    <td>
                      {u.id === ctx.userId ? (
                        <span className="tiny">ログイン中</span>
                      ) : manageable ? (
                        <div className="row" style={{ gap: 4 }}>
                          <Link className="btn" href={`/accounts/${u.id}`}>
                            編集
                          </Link>
                          {u.status !== "invited" ? (
                            <form action={setSuspended}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input
                                type="hidden"
                                name="suspend"
                                value={u.status === "suspended" ? "0" : "1"}
                              />
                              <button className="btn" type="submit">
                                {u.status === "suspended" ? "再開" : "停止"}
                              </button>
                            </form>
                          ) : null}
                          {lockedNow ? (
                            <form action={unlockUser}>
                              <input type="hidden" name="userId" value={u.id} />
                              <button className="btn" type="submit">
                                ロック解除
                              </button>
                            </form>
                          ) : null}
                          <form action={sendPasswordReset}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button className="btn" type="submit">
                              再設定メール
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="tiny">本部が管理</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>アカウントを招待</h2>
          <InviteForm
            facilities={facilities}
            venues={(venues ?? []).map((v) => ({ id: v.id, name: v.name }))}
          />
        </section>
        <section className="panel">
          <h2>パスワードとログインの決まり</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li>パスワードは12文字以上。漏えい済みのパスワードは使えない</li>
            <li>初回は招待メールのリンクから本人が設定する</li>
            <li>本部管理者・施設管理者は多要素認証（認証アプリ）が必須</li>
            <li>5回続けて失敗すると15分ロック。繰り返すと管理者の解除が必要</li>
            <li>30分操作がない、またはログインから12時間で自動ログアウト</li>
            <li>エラーでは、どの項目が違うかを表示しない</li>
            <li>ログイン履歴は1年保存する。90日使われていないアカウントは停止候補として表示する</li>
          </ul>
        </section>
      </div>

      {isHqAdmin ? (
        <section className="panel">
          <h2>施設（クライアント）</h2>
          <div className="tw" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>施設コード</th>
                  <th>施設名</th>
                  <th>補足</th>
                </tr>
              </thead>
              <tbody>
                {(venues ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className="num">{v.code}</td>
                    <td>
                      <Link href={`/f/${v.code}`}>{v.name}</Link>
                    </td>
                    <td>{v.sub ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FacilityForm />
        </section>
      ) : null}

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>ログイン履歴（新しい順・100件）</h2>
          <a className="btn" href="/accounts/history.csv" download>
            CSVで保存
          </a>
        </div>
        <div className="tw" style={{ maxHeight: 360, overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>施設</th>
                <th>アカウント</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((h) => (
                <tr key={h.id}>
                  <td className="num small">{fmt(h.at)}</td>
                  <td className="num small">{h.facility?.code ?? "—"}</td>
                  <td className="small">{h.user?.display_name ?? h.email_entered ?? "—"}</td>
                  <td>
                    <span
                      className={`pill ${GOOD_EVENTS.has(h.event) ? "good" : h.event.includes("fail") || h.event.includes("lock") ? "bad" : ""}`}
                    >
                      {EVENT_LABEL[h.event] ?? h.event}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
