import { formatYen } from "@/lib/core/format";
import { canSetBudgetCap } from "@/lib/core/permissions";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { BudgetForm } from "./budget-form";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "short",
    timeStyle: "short",
  });

export default async function FacilityOverview({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { facility, roles } = await requireFacility(code);

  // この施設の行だけを読む（DB の行ごとのアクセス制限でも、ほかの施設の行は返らない）
  const supabase = await userClient();
  const { data: logs } = await supabase
    .from("operation_log")
    .select("id, action, at, actor:actor_id (display_name)")
    .eq("facility_id", facility.id)
    .order("at", { ascending: false })
    .limit(20);

  return (
    <div className="stack">
      <div>
        <h1>
          {facility.name}
          {facility.sub ? (
            <span className="muted" style={{ fontSize: 15 }}>
              ｜{facility.sub}
            </span>
          ) : null}
        </h1>
        <p className="lead">
          この画面と各メニューには、上で選んだ施設（クライアント）のデータだけが表示されます。施設を切り替えると、同じ画面のまま表示が切り替わります。
        </p>
      </div>

      <div className="grid2">
        <section className="panel">
          <h2>施設の設定</h2>
          <dl className="kv">
            <dt>施設コード</dt>
            <dd className="num">{facility.code}</dd>
            <dt>地域</dt>
            <dd>{facility.region ?? "—"}</dd>
            <dt>LP のドメイン</dt>
            <dd>{facility.lp_domain ?? "—"}</dd>
            <dt>Fee率</dt>
            <dd>{(facility.fee_rate_bp / 100).toFixed(0)}%</dd>
            <dt>分析の最小母数</dt>
            <dd>{facility.min_n}</dd>
            <dt>月間広告費の上限</dt>
            <dd data-testid="budget-cap">
              {facility.monthly_budget_cap_yen === null
                ? "未設定"
                : formatYen(facility.monthly_budget_cap_yen)}
            </dd>
          </dl>
          <div style={{ marginTop: 14 }}>
            {canSetBudgetCap(roles) ? (
              <BudgetForm code={facility.code} current={facility.monthly_budget_cap_yen} />
            ) : (
              <p className="tiny" style={{ margin: 0 }}>
                月間広告費の上限は、施設管理者が設定します。
              </p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>操作の記録</h2>
            <a className="btn" href={`/f/${facility.code}/operations.csv`} download>
              CSVで保存
            </a>
          </div>
          {logs?.length ? (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>実行者</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="num small">{dateTime(l.at)}</td>
                      <td>{l.actor?.display_name ?? "—"}</td>
                      <td>{l.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">まだありません。</p>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>これから入るメニュー</h2>
        <p className="small muted" style={{ margin: 0 }}>
          ①Dolphinデータ連携（M2）、②分析・④広告分析レポート・⑤予約・来館・成約（M3）、③広告クリエイティブ案（M4）の順に作ります。どのメニューも、選んだ施設のデータだけを表示します。
        </p>
      </section>
    </div>
  );
}
