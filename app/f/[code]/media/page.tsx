import Link from "next/link";
import { APPEAL_AXES } from "@/lib/content/appeal-axes";
import { appConfig } from "@/config/app";
import { formatCount, formatPercent, formatYen } from "@/lib/core/format";
import {
  evaluateMedia,
  lastYearMonth,
  type Judge,
  type OutletEvaluation,
} from "@/lib/core/media/evaluate";
import { MATCH_LABEL, matchLevel, type MatchLevel } from "@/lib/core/media/match";
import { OUTLET_LABEL, type OutletCode } from "@/lib/core/media/outlets";
import type { DraftRow } from "@/lib/core/media/sheet";
import { makePeriod, periodRangeUtc } from "@/lib/core/periods";
import { canEditMedia } from "@/lib/core/permissions";
import { loadMainCustomers, loadMediaData } from "@/lib/server/media/data";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { discardMediaDoc } from "./actions";
import { DraftReview, MatchCommentButton, TopAdForm, UploadBox, ValuesForm } from "./forms";

type Search = Promise<{ from?: string; to?: string; saved?: string }>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ym = (d: string) => d.slice(0, 7);
/** 今月（日本時間） */
const thisMonth = () => ym(new Date(new Date().getTime() + 9 * 3_600_000).toISOString());
const jpMonth = (m: string) => `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`;
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (out.length < 24) {
    const s = `${y}-${String(m).padStart(2, "0")}`;
    out.push(`${s}-01`);
    if (s === to) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
const lastDay = (m: string) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0));
  return d.toISOString().slice(0, 10);
};
const fmtAt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function Pill({ j }: { j: Judge }) {
  if (j.label === "—") return <span className="na">—</span>;
  return <span className={`pill ${j.tone === "neutral" ? "" : j.tone}`}>{j.label}</span>;
}

/** 今年と昨年を2段で（下段は小さく） */
function Two({
  now,
  before,
  fmt,
}: {
  now: number | null;
  before: number | null;
  fmt: (v: number | null) => string;
}) {
  return (
    <>
      <span className="num">{now === null ? "—" : fmt(now)}</span>
      <span className="sub">昨年 {before === null ? "—" : fmt(before)}</span>
    </>
  );
}
const yen = (v: number | null) => formatYen(v);
const cnt = (v: number | null) => formatCount(v);
const pct = (v: number | null) => formatPercent(v, 0);

function EvalRow({ r, total = false }: { r: OutletEvaluation; total?: boolean }) {
  return (
    <tr className={total ? "total" : undefined}>
      <th scope="row">
        {r.label}
        {r.menus.length ? <span className="sub">{r.menus.join("・")}</span> : null}
      </th>
      <td className="r">{r.cost === null ? "—" : yen(r.cost)}</td>
      <td className="r">
        <span className="num">{cnt(r.visits)}</span>
        <span className="sub">目標 {r.target ? cnt(r.target) : "—"}</span>
      </td>
      <td className="r">
        <span className="num">{r.target ? pct(r.targetRate) : "—"}</span>
        <Pill j={r.judges.target} />
      </td>
      <td className="r">
        <span className="num">{pct(r.lastYearRate)}</span>
        <span className="sub">昨年 {cnt(r.lastVisits)}件</span>
        <Pill j={r.judges.lastYear} />
      </td>
      <td className="r">
        <Two now={r.visitCost} before={r.lastVisitCost} fmt={yen} />
        <Pill j={r.judges.visitCost} />
      </td>
      <td className="r">
        <span className="num">{cnt(r.contracts)}</span>
        <span className="sub">昨年 {cnt(r.lastContracts)}</span>
      </td>
      <td className="r">
        <Two now={r.contractCost} before={r.lastContractCost} fmt={yen} />
        <Pill j={r.judges.contractCost} />
      </td>
      <td className="r">
        <Two now={r.areaVisitShare} before={r.lastAreaVisitShare} fmt={pct} />
        <Pill j={r.judges.areaVisit} />
      </td>
      <td className="r">
        <Two now={r.areaContractShare} before={r.lastAreaContractShare} fmt={pct} />
        <Pill j={r.judges.areaContract} />
      </td>
      <td>{total ? <span className="na">—</span> : <Pill j={r.judges.visual} />}</td>
      <td>{total ? <span className="na">—</span> : <Pill j={r.judges.catch} />}</td>
      <td>
        <Pill j={r.overall} />
      </td>
    </tr>
  );
}

const axisLabel = (code: string) => APPEAL_AXES.find((a) => a.code === code)?.label ?? code;

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Search;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const { facility, roles } = await requireFacility(code);
  const supabase = await userClient();
  const editable = canEditMedia(roles);
  const saved = sp.saved?.match(/^(\d+)-(\d+)$/);
  const data = await loadMediaData(supabase, facility.id);

  // 期間：指定がなければ、結果が入っている最新の月
  const latest = data.results.length
    ? ym(data.results[data.results.length - 1]!.month)
    : thisMonth();
  const from = sp.from && MONTH.test(sp.from) ? sp.from : latest;
  const to = sp.to && MONTH.test(sp.to) && sp.to >= from ? sp.to : from;
  const months = monthsBetween(from, to);
  const range = periodRangeUtc(makePeriod(`${from}-01`, lastDay(to)));

  const customers = await loadMainCustomers(supabase, facility.id, range);
  const matches: Partial<Record<string, { visual: MatchLevel; catch: MatchLevel }>> = {};
  for (const ad of data.ads) {
    const c = customers[ad.outlet as OutletCode] ?? {
      n: 0,
      clusters: [],
      ages: [],
      areas: [],
      axes: [],
    };
    matches[ad.outlet] = {
      visual: matchLevel(c, ad.visual_axes, facility.min_n),
      catch: matchLevel(c, ad.catch_axes, facility.min_n),
    };
  }
  const ev = evaluateMedia({ results: data.results, areas: data.areas, months, matches });

  // 月別の推移（媒体×月）
  const monthKeys = months;
  const cellOf = (outlet: string, m: string) => {
    const rows = data.results.filter((r) => r.outlet === outlet && r.month === m);
    if (!rows.length) return null;
    const sum = (k: "cost_yen" | "visits" | "contracts") =>
      rows.some((r) => r[k] !== null) ? rows.reduce((s, r) => s + (r[k] ?? 0), 0) : null;
    return { cost: sum("cost_yen"), visits: sum("visits"), contracts: sum("contracts") };
  };

  const visuals = new Map<string, string>();
  const paths = data.ads.map((a) => a.visual_path).filter((p): p is string => !!p);
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from("facility-files")
      .createSignedUrls(paths, appConfig.signedUrlTtlSeconds);
    for (const s of signed ?? []) if (s.path && s.signedUrl) visuals.set(s.path, s.signedUrl);
  }
  const pending = data.docs.filter((d) => d.status === "parsed");
  const base = `/f/${facility.code}/media`;
  const y = Number(latest.slice(0, 4));
  const presets = [
    { label: `最新月（${jpMonth(latest)}）`, from: latest, to: latest },
    {
      label: "直近3か月",
      from: ym(monthsBetween(`${y - 1}-01`, latest).slice(-3)[0]!),
      to: latest,
    },
    { label: `${y}年（1月〜）`, from: `${y}-01`, to: latest },
  ];
  const T = appConfig.mediaEvaluation;

  return (
    <div className="stack">
      <div>
        <h1>メディア評価測定</h1>
        <p className="lead">
          ゼクシィ・ハナユメ・公式HP
          など掲載している媒体ごとに、来館件数（目標比・昨年比）、来館単価、成約単価、エリア平均との比較、来館されたお客様と
          TOP 広告の合致を評価します。掲載媒体・掲載金額の資料を入れると、表に起こして評価します。
        </p>
      </div>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <b className="small">
              対象期間：{from === to ? jpMonth(from) : `${jpMonth(from)}〜${jpMonth(to)}`}
            </b>
            <span className="tiny">
              （昨年比は {jpMonth(ym(lastYearMonth(`${from}-01`)))}
              {from === to ? "" : `〜${jpMonth(ym(lastYearMonth(`${to}-01`)))}`} と比べます）
            </span>
          </div>
          <form className="row" method="get" action={base} style={{ alignItems: "flex-end" }}>
            <label className="fld" style={{ margin: 0 }}>
              <span>開始月</span>
              <input type="month" name="from" defaultValue={from} />
            </label>
            <label className="fld" style={{ margin: 0 }}>
              <span>終了月</span>
              <input type="month" name="to" defaultValue={to} />
            </label>
            <button className="btn" type="submit">
              表示
            </button>
          </form>
        </div>
        <nav className="chips" aria-label="期間" style={{ marginTop: 10 }}>
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`${base}?from=${p.from}&to=${p.to}`}
              aria-current={p.from === from && p.to === to ? "true" : undefined}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </section>

      {!ev.hasData ? (
        <section className="panel">
          <p className="notice" role="status">
            この期間の媒体のデータがありません。下の「資料を入れる」から、掲載媒体・掲載金額の資料（来館・成約の数を含むもの）を入れてください。
          </p>
        </section>
      ) : (
        <>
          <section className="panel" data-testid="media-summary">
            <h2>全媒体の合計</h2>
            <div className="kpis">
              <div className="kpi">
                <div className="l">掲載金額</div>
                <div className="v">{formatYen(ev.total.cost)}</div>
              </div>
              <div className="kpi main">
                <div className="l">来館件数</div>
                <div className="v" data-testid="total-visits">
                  {formatCount(ev.total.visits)}
                  <small>件</small>
                </div>
                <span className="dlt">
                  目標比 {ev.total.target ? formatPercent(ev.total.targetRate, 0) : "—"}／昨年比{" "}
                  {formatPercent(ev.total.lastYearRate, 0)}
                </span>
              </div>
              <div className="kpi">
                <div className="l">来館単価</div>
                <div className="v">{formatYen(ev.total.visitCost)}</div>
                <span className="dlt">昨年 {formatYen(ev.total.lastVisitCost)}</span>
              </div>
              <div className="kpi">
                <div className="l">成約件数</div>
                <div className="v">
                  {formatCount(ev.total.contracts)}
                  <small>件</small>
                </div>
                <span className="dlt">昨年 {formatCount(ev.total.lastContracts)}件</span>
              </div>
              <div className="kpi main">
                <div className="l">成約単価</div>
                <div className="v">{formatYen(ev.total.contractCost)}</div>
                <span className="dlt">昨年 {formatYen(ev.total.lastContractCost)}</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>媒体別の評価</h2>
            <div className="tw">
              <table className="evaltable" data-testid="media-eval">
                <thead>
                  <tr>
                    <th>媒体</th>
                    <th className="r">掲載金額</th>
                    <th className="r">来館件数</th>
                    <th className="r">目標比</th>
                    <th className="r">昨年比</th>
                    <th className="r">来館単価</th>
                    <th className="r">成約件数</th>
                    <th className="r">成約単価</th>
                    <th className="r">エリア平均比（来館）</th>
                    <th className="r">エリア平均比（成約）</th>
                    <th>ビジュアル合致</th>
                    <th>キャッチ合致</th>
                    <th>総合</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.rows.map((r) => (
                    <EvalRow key={r.outlet} r={r} />
                  ))}
                  <EvalRow r={ev.total} total />
                </tbody>
              </table>
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              単価は全媒体の平均（来館単価 {formatYen(ev.avgVisitCost)}、成約単価{" "}
              {formatYen(ev.avgContractCost)}）と比べます。エリア平均比は「自会場の件数 ÷
              エリア平均」で、昨年の同じ月の比率と比べます。来館{T.minVisits}
              件未満の媒体は「保留」とし、掲載の継続・中止は人が判断します。
            </p>
          </section>

          <section className="panel">
            <h2>月別の推移</h2>
            <div className="tw">
              <table data-testid="media-months">
                <thead>
                  <tr>
                    <th>媒体</th>
                    {monthKeys.map((m) => (
                      <th key={m} className="r">
                        {jpMonth(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ev.rows.map((r) => (
                    <tr key={r.outlet}>
                      <th scope="row">{r.label}</th>
                      {monthKeys.map((m) => {
                        const c = cellOf(r.outlet, m);
                        return (
                          <td key={m} className="r">
                            {c ? (
                              <>
                                <span className="num">
                                  来館 {formatCount(c.visits)}・成約 {formatCount(c.contracts)}
                                </span>
                                <span className="sub">
                                  {c.cost === null ? "金額 —" : formatYen(c.cost)}
                                </span>
                              </>
                            ) : (
                              <span className="na">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="panel" id="match">
        <h2>来館メイン顧客と TOP 広告の合致</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          その媒体から来館したお客様（Dolphin
          の接客で、流入元がその媒体のもの）が重視している訴求と、媒体に掲載している TOP
          広告のビジュアル・キャッチの訴求を比べます。
          いちばん重視される訴求が入っていれば「合致」、上位3つのどれかなら「一部合致」です。来館が最小母数（
          {facility.min_n}件）未満なら「参考外」です。
        </p>
        <div className="grid2">
          {[...new Set([...data.ads.map((a) => a.outlet), ...Object.keys(customers)])].map((o) => {
            const ad = data.ads.find((a) => a.outlet === o);
            const c = customers[o as OutletCode];
            const m = matches[o];
            return (
              <div key={o} className="conn" data-testid={`match-${o}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{OUTLET_LABEL[o as OutletCode] ?? o}</b>
                  {m ? (
                    <span className="row" style={{ gap: 6 }}>
                      <span className="tiny">ビジュアル</span>
                      <Pill
                        j={{
                          tone:
                            m.visual === "match"
                              ? "good"
                              : m.visual === "partial"
                                ? "warn"
                                : m.visual === "mismatch"
                                  ? "bad"
                                  : "neutral",
                          label: MATCH_LABEL[m.visual],
                        }}
                      />
                      <span className="tiny">キャッチ</span>
                      <Pill
                        j={{
                          tone:
                            m.catch === "match"
                              ? "good"
                              : m.catch === "partial"
                                ? "warn"
                                : m.catch === "mismatch"
                                  ? "bad"
                                  : "neutral",
                          label: MATCH_LABEL[m.catch],
                        }}
                      />
                    </span>
                  ) : (
                    <span className="pill">広告未登録</span>
                  )}
                </div>
                <div className="small">
                  <b>来館メイン顧客</b>（{c?.n ?? 0}人）：
                  {c && c.n ? (
                    <>
                      {c.axes.length
                        ? c.axes
                            .map((a) => `${axisLabel(a.key)} ${formatPercent(a.share, 0)}`)
                            .join("・")
                        : "重視点の記録なし"}
                      <span className="tiny">
                        {" "}
                        {[
                          c.clusters[0] && `クラスタ ${c.clusters[0].key}`,
                          c.ages[0] && `${c.ages[0].key}歳`,
                          c.areas[0] && c.areas[0].key,
                        ]
                          .filter(Boolean)
                          .join("／")}
                      </span>
                    </>
                  ) : (
                    "この期間の接客データがありません"
                  )}
                </div>
                {ad ? (
                  <div
                    className="row"
                    style={{ alignItems: "flex-start", gap: 10, flexWrap: "nowrap" }}
                  >
                    {ad.visual_path && visuals.get(ad.visual_path) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 期限付きの署名URLを、そのまま表示する
                      <img
                        src={visuals.get(ad.visual_path)}
                        alt={`${OUTLET_LABEL[o as OutletCode]}の TOP 広告`}
                        className="adthumb"
                      />
                    ) : null}
                    <div className="small" style={{ minWidth: 0 }}>
                      <div>「{ad.catch_text || "（キャッチ未登録）"}」</div>
                      <div className="tiny">
                        ビジュアル：{ad.visual_axes.map(axisLabel).join("・") || "—"}
                      </div>
                      <div className="tiny">
                        キャッチ：{ad.catch_axes.map(axisLabel).join("・") || "—"}
                      </div>
                    </div>
                  </div>
                ) : null}
                {ad && c && c.n && editable ? (
                  <MatchCommentButton
                    code={facility.code}
                    outlet={o}
                    from={range.from}
                    to={range.to}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {!data.ads.length && !Object.keys(customers).length ? (
          <p className="small muted">TOP 広告を登録すると、ここに合致の判定が出ます。</p>
        ) : null}
        {editable ? (
          <details style={{ marginTop: 12 }} open={!data.ads.length}>
            <summary className="small">TOP 広告を登録・変更する</summary>
            <div style={{ marginTop: 10 }}>
              <TopAdForm code={facility.code} ads={data.ads} />
            </div>
          </details>
        ) : null}
      </section>

      <section className="panel" id="docs">
        <h2>資料を入れる</h2>
        {saved ? (
          <p className="notice good" role="status">
            確定しました（媒体×月 {saved[1]}行、エリア平均 {saved[2]}
            行）。上の評価に反映しています。
          </p>
        ) : null}
        {editable ? (
          <UploadBox code={facility.code} />
        ) : (
          <p className="tiny">資料の取込は、マーケ・データ（Aさん）と施設管理者が行います。</p>
        )}

        {pending.length ? (
          <div style={{ marginTop: 16 }}>
            <h3>確認待ちの資料</h3>
            {pending.map((d) => (
              <div key={d.id} className="stack" style={{ gap: 8, marginBottom: 16 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="small">
                    <b>{d.file_name}</b>（{d.method === "ai" ? "AI で読み取り" : "表から読み取り"}・
                    {fmtAt(d.created_at)}）
                  </span>
                  {editable ? (
                    <form action={discardMediaDoc}>
                      <input type="hidden" name="code" value={facility.code} />
                      <input type="hidden" name="doc" value={d.id} />
                      <button className="btn" type="submit">
                        取り消す
                      </button>
                    </form>
                  ) : null}
                </div>
                {d.message ? <span className="tiny">{d.message}</span> : null}
                {editable ? (
                  <DraftReview code={facility.code} docId={d.id} rows={d.draft as DraftRow[]} />
                ) : (
                  <span className="tiny">
                    確定は、マーケ・データ（Aさん）と施設管理者が行います。
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <h3 style={{ marginTop: 16 }}>取込履歴</h3>
        {data.docs.length ? (
          <div className="tw">
            <table data-testid="media-docs">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>ファイル</th>
                  <th>読み取り</th>
                  <th>状態</th>
                  <th>実行者</th>
                </tr>
              </thead>
              <tbody>
                {data.docs.map((d) => (
                  <tr key={d.id}>
                    <td className="num small">{fmtAt(d.created_at)}</td>
                    <td className="small">{d.file_name}</td>
                    <td className="small">
                      {d.method === "ai" ? "AI" : d.method === "table" ? "表" : "—"}
                    </td>
                    <td>
                      <span
                        className={`pill ${d.status === "confirmed" ? "good" : d.status === "failed" ? "bad" : d.status === "parsed" ? "warn" : ""}`}
                      >
                        {
                          {
                            parsed: "確認待ち",
                            confirmed: "確定",
                            failed: "読み取れず",
                            discarded: "取り消し",
                          }[d.status]
                        }
                      </span>
                      {d.status === "failed" && d.message ? (
                        <span className="tiny"> {d.message}</span>
                      ) : null}
                    </td>
                    <td className="small">{d.uploader?.display_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">まだ資料を入れていません。</p>
        )}
      </section>

      {editable ? (
        <section className="panel">
          <h2>数値の入力・修正</h2>
          <p className="small muted" style={{ marginTop: -4 }}>
            目標来館など資料にない値や、読み取りの誤りをここで直します。
          </p>
          <ValuesForm code={facility.code} defaultMonth={from} />
        </section>
      ) : null}

      <section className="panel">
        <h2>判定の決まり</h2>
        <div className="tw">
          <table>
            <tbody>
              <tr>
                <th scope="row">目標比</th>
                <td className="small">
                  来館 ÷ 目標来館。{formatPercent(T.target.good, 0)}以上は良好、
                  {formatPercent(T.target.warn, 0)}以上は注意、それ未満は要改善
                </td>
              </tr>
              <tr>
                <th scope="row">昨年比</th>
                <td className="small">
                  来館 ÷ 昨年の同じ月の来館。{formatPercent(T.lastYear.good, 0)}以上は良好、
                  {formatPercent(T.lastYear.warn, 0)}以上は注意
                </td>
              </tr>
              <tr>
                <th scope="row">来館単価・成約単価</th>
                <td className="small">
                  掲載金額 ÷ 来館（成約）。全媒体の平均以下は良好、平均の{T.unitCost.warn}
                  倍までは注意。来館{T.minVisits}件未満の媒体の成約単価は「保留」
                </td>
              </tr>
              <tr>
                <th scope="row">エリア平均比</th>
                <td className="small">
                  自会場の件数 ÷ 媒体社の資料のエリア平均。昨年の比率より上がれば上昇、10pt
                  以内の低下は「やや低下」
                </td>
              </tr>
              <tr>
                <th scope="row">合致</th>
                <td className="small">
                  来館メイン顧客の重視する訴求（訴求軸）と、TOP
                  広告のビジュアル・キャッチの訴求の一致
                </td>
              </tr>
              <tr>
                <th scope="row">総合</th>
                <td className="small">
                  要改善が3つ以上で「見直し候補」、要改善がなく良好が半分以上で「良好」、それ以外は「要改善」。来館が少ない媒体は「保留（小標本）」
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="tiny" style={{ marginBottom: 0 }}>
          目安は初期値です。運用しながら見直します。
        </p>
      </section>
    </div>
  );
}
