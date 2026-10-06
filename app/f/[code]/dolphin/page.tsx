import { formatCount, formatPercent } from "@/lib/core/format";
import { IMPORT_KIND_LABEL } from "@/lib/core/import/fields";
import { linkage } from "@/lib/core/linkage";
import { lastFourWeeks, periodRangeUtc } from "@/lib/core/periods";
import { canImport } from "@/lib/core/permissions";
import { DOLPHIN_ITEMS, EXTRA_NEEDS } from "@/lib/content/dolphin-items";
import { serverEnv } from "@/lib/server/env";
import { MEDIA_LABEL } from "@/lib/server/imports";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { ImportPanel } from "./import-panel";

const KIND_LABEL: Record<string, string> = {
  ...IMPORT_KIND_LABEL,
  market_report: "マーケットレポート",
};
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

export default async function DolphinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { facility, roles } = await requireFacility(code);
  const supabase = await userClient();
  const { current } = lastFourWeeks(new Date());
  const range = periodRangeUtc(current);

  const [jobs, sessions, linkedRes, otherRes, ga4] = await Promise.all([
    supabase
      .from("import_job")
      .select(
        "id, at, kind, media, file_name, rows_total, rows_ok, rows_updated, rows_duplicate, rows_missing, rows_no_consent, rows_wrong_facility, rows_invalid, pii_columns_dropped, masked_count, run_label, runner:run_by (display_name)",
      )
      .eq("facility_id", facility.id)
      .order("at", { ascending: false })
      .limit(50),
    supabase
      .from("consultation_session")
      .select("id", { count: "exact", head: true })
      .eq("facility_id", facility.id),
    supabase
      .from("crm_lead")
      .select("id", { count: "exact", head: true })
      .eq("facility_id", facility.id)
      .not("ad_id", "is", null)
      .gte("reserved_at", range.from)
      .lt("reserved_at", range.to),
    supabase
      .from("crm_lead")
      .select("id", { count: "exact", head: true })
      .eq("facility_id", facility.id)
      .is("ad_id", null)
      .gte("reserved_at", range.from)
      .lt("reserved_at", range.to),
    supabase
      .from("funnel_event")
      .select("generate_lead")
      .eq("facility_id", facility.id)
      .gte("date", current.start)
      .lte("date", current.end),
  ]);

  const jobList = jobs.data ?? [];
  const lastOf = (kind: string) => jobList.find((j) => j.kind === kind)?.at ?? null;
  const noConsent = jobList
    .filter((j) => j.kind === "consultation")
    .reduce((a, j) => a + j.rows_no_consent, 0);
  const link = linkage({
    linkedReservations: linkedRes.count ?? 0,
    otherReservations: otherRes.count ?? 0,
    ga4GenerateLead: (ga4.data ?? []).reduce((a, r) => a + Number(r.generate_lead), 0),
  });

  const allowed = (
    ["consultation", "crm", "ads", "ga4", "images", "market_report"] as const
  ).filter((k) => canImport(roles, k));
  const showSample = serverEnv().APP_ENV !== "production" && allowed.includes("consultation");

  const conns: [string, string, "good" | "warn" | "sky", string][] = [
    [
      "Dolphin 接客データ",
      lastOf("consultation")
        ? `CSV取込（最終 ${fmt(lastOf("consultation"))}）`
        : "CSV取込（未取込）",
      "warn",
      "API の仕様が分かり次第、自動取込へ（第2段階）",
    ],
    [
      "Dolphin 生成画像",
      lastOf("images") ? `手動取込（最終 ${fmt(lastOf("images"))}）` : "手動取込（未取込）",
      "warn",
      "画像ファイル＋情報CSV",
    ],
    [
      "予約・来館・成約（CRM）",
      lastOf("crm") ? `CSV取込（最終 ${fmt(lastOf("crm"))}）` : "CSV取込（未取込）",
      "sky",
      "lead_id で予約台帳と照合",
    ],
    [
      "Google 広告",
      lastOf("ads") ? `CSV取込（最終 ${fmt(lastOf("ads"))}）` : "CSV取込（未取込）",
      "sky",
      "API での取込は M5（権限が用意でき次第）",
    ],
    ["Meta 広告", "CSV取込", "sky", "API での取込は M5、承認済みの広告の配信は M4b"],
    [
      "GA4",
      lastOf("ga4") ? `CSV取込（最終 ${fmt(lastOf("ga4"))}）` : "CSV取込（未取込）",
      "sky",
      "LP・予約フォームのイベント",
    ],
  ];

  return (
    <div className="stack">
      <div>
        <h1>Dolphinデータ連携</h1>
        <p className="lead">
          新規接客の分析データと予約・来館・成約を lead_id でつなぎます。Dolphin
          の接続仕様が確定するまでは CSV
          から取り込み、広告改善への同意が確認できたデータだけを使います。
        </p>
      </div>

      <section className="panel">
        <h2>接続状況</h2>
        <div className="grid3">
          {conns.map(([t, s, k, d]) => (
            <div key={t} className="conn">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b className="small">{t}</b>
                <span className={`pill ${k}`}>{s}</span>
              </div>
              <span className="tiny">{d}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>データを取り込む</h2>
          {showSample ? (
            <a
              className="btn"
              href={`/f/${facility.code}/dolphin/template?kind=consultation&sample=1`}
              download
            >
              サンプルCSVを保存（開発・テスト用）
            </a>
          ) : null}
        </div>
        <ImportPanel code={facility.code} facilityName={facility.name} allowed={[...allowed]} />
      </section>

      <div className="grid2">
        <section className="panel">
          <h2>同意範囲</h2>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>用途</th>
                  <th className="r">取込済み（同意あり）</th>
                  <th className="r">同意がなく除外</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>広告改善への利用</td>
                  <td className="r">{formatCount(sessions.count ?? 0)}</td>
                  <td className="r">{formatCount(noConsent)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="tiny" style={{ marginBottom: 0 }}>
            広告改善に同意していない接客は取り込まず、②以降の集計と AI
            への入力にも使いません。録音・文字起こし・分析の同意は、Dolphin の CSV
            に列が加わり次第表示します。
          </p>
        </section>
        <section className="panel">
          <h2>照合結果（{current.label}）</h2>
          <div className="tw">
            <table>
              <tbody>
                <tr>
                  <td>全予約</td>
                  <td className="r">{formatCount(link.total)}</td>
                </tr>
                <tr>
                  <td>広告起点として lead_id で紐付け</td>
                  <td className="r">{formatCount(link.linked)}</td>
                </tr>
                <tr>
                  <td>GA4 で予約完了・CRM 未結合</td>
                  <td className="r">{formatCount(link.unjoined)}</td>
                </tr>
                <tr>
                  <td>広告以外・判定不能（電話・外部サイト・UTM欠損）</td>
                  <td className="r">{formatCount(link.other)}</td>
                </tr>
                <tr>
                  <td>
                    <b>計測紐付け率</b>
                  </td>
                  <td className="r" data-testid="link-rate">
                    <b>{formatPercent(link.rate)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="tiny" style={{ marginBottom: 0 }}>
            判定できない予約を、任意の広告へ割り振りません。電話・外部予約サイトは別の受け渡し設計が必要です。
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>取込履歴</h2>
        {jobList.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>日時</th>
                  <th>ファイル</th>
                  <th>種別</th>
                  <th className="r">行数</th>
                  <th className="r">取込</th>
                  <th className="r">更新</th>
                  <th className="r">重複</th>
                  <th className="r">欠損</th>
                  <th className="r">同意外</th>
                  <th className="r">他施設</th>
                  <th className="r">形式の誤り</th>
                  <th>個人情報の列</th>
                  <th className="r">伏せ字</th>
                  <th>実行者</th>
                </tr>
              </thead>
              <tbody>
                {jobList.map((j) => (
                  <tr key={j.id}>
                    <td className="num small">{fmt(j.at)}</td>
                    <td className="small">{j.file_name}</td>
                    <td className="small">
                      {KIND_LABEL[j.kind] ?? j.kind}
                      {j.media ? `（${MEDIA_LABEL[j.media]}）` : ""}
                    </td>
                    <td className="r">{j.rows_total}</td>
                    <td className="r">{j.rows_ok}</td>
                    <td className="r">{j.rows_updated}</td>
                    <td className="r">{j.rows_duplicate}</td>
                    <td className="r">{j.rows_missing}</td>
                    <td className="r">{j.rows_no_consent}</td>
                    <td className="r">{j.rows_wrong_facility}</td>
                    <td className="r">{j.rows_invalid}</td>
                    <td className="small">
                      {j.pii_columns_dropped.length
                        ? `${j.pii_columns_dropped.join("・")}（除外）`
                        : "—"}
                    </td>
                    <td className="r">{j.masked_count}</td>
                    <td className="small">{j.runner?.display_name ?? j.run_label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">まだ取り込んでいません。</p>
        )}
      </section>

      <section className="panel">
        <h2>Dolphinから受け取るデータ（予定）</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>項目</th>
                <th>内容</th>
                <th>Dolphin CREATE での使い道</th>
                <th>一緒に必要なキー・形式</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {DOLPHIN_ITEMS.map((x) => (
                <tr key={x[0]}>
                  <td className="num">
                    <b>{x[0]}</b>
                  </td>
                  <td>
                    <b>{x[1]}</b>
                  </td>
                  <td className="small">{x[2]}</td>
                  <td className="small">{x[3]}</td>
                  <td className="small">{x[4]}</td>
                  <td>
                    <span
                      className={`pill ${x[5] === "受領予定" ? "sky" : x[5] === "形式を相談" ? "warn" : "good"}`}
                    >
                      {x[5]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>追加でいただきたい項目</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          ①〜⑩を成約・広告と結びつけて正しく集計するために必要です。
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>区分</th>
                <th>項目</th>
                <th>必要な理由</th>
              </tr>
            </thead>
            <tbody>
              {EXTRA_NEEDS.map((x) => (
                <tr key={x[0]}>
                  <td>
                    <b>{x[0]}</b>
                  </td>
                  <td className="small">{x[1]}</td>
                  <td className="small">{x[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
