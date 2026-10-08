import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount, formatPercent, formatYen, ratio } from "@/lib/core/format";
import { diagnose, recommend, stageRates, sumFunnels, type Diagnosis } from "@/lib/core/funnel";
import { parsePeriod, periodPresets, previousPeriod } from "@/lib/core/periods";
import { canImport } from "@/lib/core/permissions";
import { PAGE_KIND_LABEL } from "@/lib/core/site/pages";
import { buildSiteReport, type Outcome } from "@/lib/core/site/report";
import { MEDIA_LABEL, type Media } from "@/lib/server/imports";
import { loadAdFunnels, loadPageRules, loadSiteRows } from "@/lib/server/reports/funnel-data";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";
import { deletePageRule } from "./actions";
import { PageRuleForm } from "./page-rule-form";

type Search = Promise<{ from?: string; to?: string; prefix?: string }>;

/** 件数の前期比（%）。前期が0なら比べない */
function deltaCount(now: number, before: number) {
  if (before <= 0) return <span className="dlt">前期比 —</span>;
  const d = (now - before) / before;
  return (
    <span className={`dlt ${d > 0 ? "up" : d < 0 ? "dn" : ""}`}>
      前期比 {d > 0 ? "+" : ""}
      {(d * 100).toFixed(0)}%
    </span>
  );
}

/** 率の前期比（ポイント差） */
function deltaRate(now: number | null, before: number | null) {
  if (now === null || before === null) return <span className="dlt">前期比 —</span>;
  const d = (now - before) * 100;
  return (
    <span className={`dlt ${d > 0 ? "up" : d < 0 ? "dn" : ""}`}>
      前期比 {d > 0 ? "+" : ""}
      {d.toFixed(1)}pt
    </span>
  );
}

function Bar({ value, max, low = false }: { value: number | null; max: number; low?: boolean }) {
  const w = value === null || max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className={`bar${low ? " low" : ""}`}>
      <i style={{ width: `${w}%` }} />
    </div>
  );
}

const pillOf = (d: Diagnosis) => (d.tone === "good" ? "good" : d.tone === "warn" ? "warn" : "sky");

/** 訪問数・予約数・予約率の表（流入元・最初のページ・エリア・新規/再訪で共通） */
function OutcomeTable({
  head,
  rows,
  testId,
}: {
  head: string;
  rows: (Outcome & { name: ReactNode; sub?: string })[];
  testId: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.bookingRate ?? 0));
  return (
    <div className="tw">
      <table data-testid={testId}>
        <thead>
          <tr>
            <th>{head}</th>
            <th className="r">訪問数</th>
            <th className="r">予約数</th>
            <th className="r">予約率</th>
            <th style={{ width: "22%" }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                {r.name}
                {r.sub ? <span className="tiny"> {r.sub}</span> : null}
              </td>
              <td className="r num">{formatCount(r.sessions)}</td>
              <td className="r num">{formatCount(r.bookings)}</td>
              <td className="r num">{formatPercent(r.bookingRate)}</td>
              <td>
                <Bar value={r.bookingRate} max={max} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageTable({
  rows,
  testId,
  empty,
}: {
  rows: ReturnType<typeof buildSiteReport>["fairPlan"];
  testId: string;
  empty: string;
}) {
  if (!rows.length) return <p className="small muted">{empty}</p>;
  return (
    <div className="tw">
      <table data-testid={testId}>
        <thead>
          <tr>
            <th>ページ</th>
            <th className="r">閲覧数</th>
            <th className="r">閲覧した人</th>
            <th className="r">平均閲覧時間</th>
            <th className="r">予約ボタン</th>
            <th className="r">予約ボタン率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="r num">{formatCount(r.views)}</td>
              <td className="r num">{formatCount(r.users)}</td>
              <td className="r num">
                {r.avgEngagementSec === null ? "算出不可" : `${Math.floor(r.avgEngagementSec)}秒`}
              </td>
              <td className="r num">{formatCount(r.reserveClicks)}</td>
              <td className="r num">{formatPercent(r.reserveClickRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FunnelPage({
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

  const presets = periodPresets(new Date());
  const period = parsePeriod(sp.from, sp.to) ?? presets[0]!.period;
  const prev = previousPeriod(period);
  const [rowsNow, rowsPrev, rules, adData] = await Promise.all([
    loadSiteRows(supabase, facility.id, period),
    loadSiteRows(supabase, facility.id, prev),
    loadPageRules(supabase, facility.id),
    loadAdFunnels(supabase, facility.id, period),
  ]);
  const site = buildSiteReport(rowsNow, rules);
  const before = buildSiteReport(rowsPrev, rules);
  const editable = canImport(roles, "ga4");
  const base = `/f/${facility.code}/funnel`;
  const q = `from=${period.start}&to=${period.end}`;

  // 予約後の来館・成約（予約台帳）
  const { ads, other } = adData;
  const total = sumFunnels(ads.map((a) => a.f));
  const stages = stageRates(total);
  const stuck = stages.filter((s) => s.low);
  const avgCpc = ratio(total.cost, total.contract);
  const byMedia = new Map<Media, { mediaCv: number; lead: number; res: number }>();
  for (const a of ads) {
    if (!a.media) continue;
    const m = byMedia.get(a.media) ?? { mediaCv: 0, lead: 0, res: 0 };
    m.mediaCv += a.f.mediaCv;
    m.lead += a.f.lead;
    m.res += a.f.res;
    byMedia.set(a.media, m);
  }
  const unknownMedia = ads.filter((a) => !a.media);
  const funnelMax = Math.max(1, ...site.funnel.map((s) => s.reach));
  const hourMax = Math.max(1, ...site.hours.map((h) => h.sessions));
  const dowMax = Math.max(0, ...site.daysOfWeek.map((d) => d.bookingRate ?? 0));

  return (
    <div className="stack">
      <div>
        <h1>予約・来館・成約</h1>
        <p className="lead">
          会場のホームページ（GA4）で、フェア・見学予約がどこから・どのページで・どの端末で生まれているかを見たうえで、予約台帳（lead_id）で来館・成約までを広告ごとにたどります。媒体報告・GA4・予約台帳の値は混ぜずに並べます。
        </p>
      </div>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <b className="small">対象期間：{period.label}</b>
            <span className="tiny">（前期比は {prev.label} と比べます）</span>
          </div>
          <form className="row" method="get" action={base} style={{ alignItems: "flex-end" }}>
            <label className="fld" style={{ margin: 0 }}>
              <span>開始日</span>
              <input type="date" name="from" defaultValue={period.start} />
            </label>
            <label className="fld" style={{ margin: 0 }}>
              <span>終了日</span>
              <input type="date" name="to" defaultValue={period.end} />
            </label>
            <button className="btn" type="submit">
              表示
            </button>
          </form>
        </div>
        <nav className="chips" aria-label="期間" style={{ marginTop: 10 }}>
          {presets.map((p) => (
            <Link
              key={p.id}
              href={`${base}?from=${p.period.start}&to=${p.period.end}`}
              aria-current={
                p.period.start === period.start && p.period.end === period.end ? "true" : undefined
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </section>

      <p className="part">ホームページでの予約獲得（GA4）</p>

      {!site.hasData ? (
        <section className="panel">
          <p className="notice" role="status">
            この期間の GA4 のデータがありません。「Dolphinデータ連携」の{" "}
            <Link href={`/f/${facility.code}/dolphin#ga4`}>GA4 の接続</Link>{" "}
            でプロパティを登録して取り込むと、ここに表示します。
          </p>
        </section>
      ) : (
        <>
          <section className="panel" data-testid="completion">
            <h2>フェア・見学予約の完了</h2>
            <div className="kpis">
              <div className="kpi">
                <div className="l">訪問数（セッション）</div>
                <div className="v">{formatCount(site.completion.sessions)}</div>
                {deltaCount(site.completion.sessions, before.completion.sessions)}
              </div>
              <div className="kpi main">
                <div className="l">予約完了数</div>
                <div className="v" data-testid="bookings">
                  {formatCount(site.completion.bookings)}
                  <small>件</small>
                </div>
                {deltaCount(site.completion.bookings, before.completion.bookings)}
              </div>
              <div className="kpi main">
                <div className="l">予約完了セッション割合</div>
                <div className="v" data-testid="booking-rate">
                  {formatPercent(site.completion.bookingRate, 2)}
                </div>
                {deltaRate(site.completion.bookingRate, before.completion.bookingRate)}
              </div>
              <div className="kpi">
                <div className="l">資料請求</div>
                <div className="v">
                  {formatCount(site.completion.brochure)}
                  <small>件</small>
                </div>
                {deltaCount(site.completion.brochure, before.completion.brochure)}
              </div>
              <div className="kpi">
                <div className="l">問い合わせ</div>
                <div className="v">
                  {formatCount(site.completion.contact)}
                  <small>件</small>
                </div>
                {deltaCount(site.completion.contact, before.completion.contact)}
              </div>
              <div className="kpi">
                <div className="l">電話タップ・LINE</div>
                <div className="v">
                  {formatCount(site.completion.tel)}
                  <small>・</small>
                  {formatCount(site.completion.line)}
                </div>
                <span className="dlt">予約数には含めません</span>
              </div>
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              予約完了は GA4 の
              generate_lead（フェア・見学予約の完了画面）。資料請求・問い合わせは別のイベントで数え、予約に混ぜません。
            </p>
          </section>

          <section className="panel">
            <h2>流入元別の予約成果</h2>
            <OutcomeTable
              head="流入元"
              testId="channels"
              rows={site.channels.map((c) => ({ ...c, name: c.channel }))}
            />
            <details style={{ marginTop: 8 }}>
              <summary className="small">参照元／メディアの内訳</summary>
              <OutcomeTable
                head="参照元／メディア"
                testId="channel-detail"
                rows={site.channelDetail.map((c) => ({
                  ...c,
                  name: c.sourceMedium || "(不明)",
                  sub: c.channel,
                }))}
              />
            </details>
          </section>

          <section className="panel">
            <h2>予約までの途中離脱</h2>
            <div className="steps" data-testid="drop">
              <span className="h">段階</span>
              <span className="h r">到達</span>
              <span className="h" />
              <span className="h r">前の段階から離脱</span>
              {site.funnel.map((s) => (
                <FragmentRow key={s.event}>
                  <span>
                    {s.label}
                    <span className="src">{s.event}</span>
                  </span>
                  <span className="r num">{formatCount(s.reach)}</span>
                  <Bar
                    value={s.reach}
                    max={funnelMax}
                    low={s.dropRate !== null && s.dropRate > 0.7}
                  />
                  <span className="r num">
                    {s.dropRate === null ? "—" : formatPercent(s.dropRate)}
                  </span>
                </FragmentRow>
              ))}
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              到達はその操作があったセッション数。フォームの入力エラーが出たセッションは、フォーム入力開始の{" "}
              {formatPercent(site.formErrorRate)} です。
            </p>
          </section>

          <section className="panel">
            <h2>最初に訪れたページ別の成果</h2>
            <OutcomeTable
              head="最初のページ"
              testId="landing"
              rows={site.landing.map((l) => ({
                ...l,
                name: l.label,
                sub: l.matched ? PAGE_KIND_LABEL[l.kind] : "未分類",
              }))}
            />
          </section>

          <div className="grid2">
            <section className="panel">
              <h2>フェア・プラン別の成果</h2>
              <PageTable
                rows={site.fairPlan}
                testId="fair-plan"
                empty="フェア・プランのページを下の「ページの分類」で登録すると表示します。"
              />
              <p className="tiny" style={{ marginBottom: 0 }}>
                予約ボタンは、そのページで押されたフェア予約ボタン（select_fair）の数です。
              </p>
            </section>
            <section className="panel">
              <h2>コンテンツ別の関心と予約へのつながり</h2>
              <PageTable
                rows={site.content}
                testId="content"
                empty="チャペル・料理・料金などのページを「コンテンツ」として登録すると表示します。"
              />
              <p className="tiny" style={{ marginBottom: 0 }}>
                閲覧したセッションのうち、そのページで予約ボタンを押した割合を「予約ボタン率」とします。
              </p>
            </section>
          </div>

          <section className="panel">
            <h2>スマートフォンでの使いやすさ</h2>
            <div className="tw">
              <table data-testid="devices">
                <thead>
                  <tr>
                    <th>端末</th>
                    <th className="r">訪問数</th>
                    <th className="r">予約数</th>
                    <th className="r">予約率</th>
                    <th className="r">フォーム入力開始</th>
                    <th className="r">フォーム離脱率</th>
                    <th className="r">入力エラー率</th>
                  </tr>
                </thead>
                <tbody>
                  {site.devices.map((d) => (
                    <tr key={d.device}>
                      <td>{d.device}</td>
                      <td className="r num">{formatCount(d.sessions)}</td>
                      <td className="r num">{formatCount(d.bookings)}</td>
                      <td className="r num">{formatPercent(d.bookingRate)}</td>
                      <td className="r num">{formatCount(d.formStarts)}</td>
                      <td className="r num">{formatPercent(d.formAbandonRate)}</td>
                      <td className="r num">{formatPercent(d.formErrorRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              フォーム離脱率＝入力を始めて予約完了しなかったセッションの割合。
            </p>
          </section>

          <div className="grid2">
            <section className="panel">
              <h2>エリア別の成果</h2>
              <OutcomeTable
                head="エリア（都道府県）"
                testId="regions"
                rows={site.regions.slice(0, 15).map((r) => ({ ...r, name: r.region }))}
              />
            </section>
            <section className="panel">
              <h2>再訪問・予約までの検討過程</h2>
              <OutcomeTable
                head="訪問"
                testId="newret"
                rows={site.newReturning.map((r) => ({ ...r, name: r.kind }))}
              />
              <p className="tiny" style={{ marginBottom: 0 }}>
                予約までの日数や、途中で触れた広告・媒体は、GA4 の BigQuery
                連携ができてから加えます。
              </p>
            </section>
          </div>

          <section className="panel">
            <h2>時期・曜日・時間帯別の変化</h2>
            <div className="grid2">
              <div>
                <h3>月別</h3>
                <OutcomeTable
                  head="月"
                  testId="months"
                  rows={site.months.map((m) => ({ ...m, name: m.month.replace("-", "年") + "月" }))}
                />
                <h3 style={{ marginTop: 12 }}>曜日別</h3>
                <div className="tw">
                  <table data-testid="dow">
                    <thead>
                      <tr>
                        <th>曜日</th>
                        <th className="r">訪問数</th>
                        <th className="r">予約数</th>
                        <th className="r">予約率</th>
                        <th style={{ width: "30%" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {site.daysOfWeek.map((d) => (
                        <tr key={d.label}>
                          <td>{d.label}</td>
                          <td className="r num">{formatCount(d.sessions)}</td>
                          <td className="r num">{formatCount(d.bookings)}</td>
                          <td className="r num">{formatPercent(d.bookingRate)}</td>
                          <td>
                            <Bar value={d.bookingRate} max={dowMax} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3>時間帯別（訪問数と予約数）</h3>
                <div className="hours" data-testid="hours">
                  {site.hours.map((h) => (
                    <div
                      key={h.hour}
                      title={`${h.hour}時台：訪問 ${h.sessions}・予約 ${h.bookings}`}
                    >
                      <i style={{ height: `${(h.sessions / hourMax) * 100}%` }} />
                      {h.bookings ? <b>{h.bookings}</b> : null}
                      <span>{h.hour}</span>
                    </div>
                  ))}
                </div>
                <p className="tiny">棒は訪問数、上の数字は予約数（時）。</p>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="panel" id="pages">
        <h2>ページの分類</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          会場のホームページの URL
          の始まりで、フェア・プラン・コンテンツなどに分けます。最初のページ・フェア・プラン別・コンテンツ別の集計に使います。
        </p>
        {rules.length ? (
          <div className="tw">
            <table data-testid="rules">
              <thead>
                <tr>
                  <th>URL の始まり</th>
                  <th>名前</th>
                  <th>種類</th>
                  {editable ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="num small">{r.prefix}</td>
                    <td>{r.label}</td>
                    <td>{PAGE_KIND_LABEL[r.kind]}</td>
                    {editable ? (
                      <td className="r">
                        <form action={deletePageRule}>
                          <input type="hidden" name="code" value={facility.code} />
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn" type="submit" aria-label={`${r.prefix} を削除`}>
                            削除
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="small muted">まだ登録していません。</p>
        )}
        {editable ? (
          <div style={{ marginTop: 12 }}>
            <PageRuleForm key={sp.prefix ?? ""} code={facility.code} prefix={sp.prefix ?? ""} />
          </div>
        ) : (
          <p className="tiny">ページの分類は、マーケ・データ（Aさん）と施設管理者が登録します。</p>
        )}
        {site.unclassifiedPages.length ? (
          <details style={{ marginTop: 12 }}>
            <summary className="small">分類していないページ（閲覧数の多い順）</summary>
            <div className="tw">
              <table data-testid="unclassified">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th className="r">閲覧数</th>
                    {editable ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {site.unclassifiedPages.map((u) => (
                    <tr key={u.path}>
                      <td className="num small">{u.path}</td>
                      <td className="r num">{formatCount(u.views)}</td>
                      {editable ? (
                        <td className="r">
                          <Link href={`${base}?${q}&prefix=${encodeURIComponent(u.path)}#pages`}>
                            分類する
                          </Link>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </section>

      <p className="part">予約後の来館・成約（予約台帳）</p>

      {!ads.length && !other.res ? (
        <section className="panel">
          <p className="notice" role="status">
            この期間の広告実績・予約台帳のデータがありません。「Dolphinデータ連携」で広告実績CSVと予約・来館・成約CSVを取り込むと表示します。
          </p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>広告クリックから成約まで</h2>
            <div className="kpis" style={{ marginBottom: 12 }}>
              <div className="kpi">
                <div className="l">費用（Fee抜き）</div>
                <div className="v">{formatYen(total.cost)}</div>
              </div>
              <div className="kpi">
                <div className="l">来館率</div>
                <div className="v">{formatPercent(ratio(total.visit, total.valid))}</div>
              </div>
              <div className="kpi">
                <div className="l">成約率</div>
                <div className="v">{formatPercent(ratio(total.contract, total.visit))}</div>
              </div>
              <div className="kpi main">
                <div className="l">成約</div>
                <div className="v" data-testid="contracts">
                  {formatCount(total.contract)}
                  <small>件</small>
                </div>
              </div>
              <div className="kpi">
                <div className="l">成約単価</div>
                <div className="v">{formatYen(avgCpc)}</div>
              </div>
              <div className="kpi">
                <div className="l">粗利ROAS</div>
                <div className="v">{formatPercent(ratio(total.grossProfit, total.cost), 0)}</div>
              </div>
            </div>
            <div className="steps" data-testid="stages">
              <span className="h">段階</span>
              <span className="h r">件数</span>
              <span className="h">前段階からの通過率</span>
              <span className="h r">目安</span>
              {stages.map((s) => (
                <FragmentRow key={s.key}>
                  <span>
                    {s.label}
                    <span className="src">{s.source}</span>
                  </span>
                  <span className="r num">{formatCount(s.value)}</span>
                  <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <div style={{ flex: 1 }}>
                      <Bar value={s.rate} max={1} low={s.low} />
                    </div>
                    <span className={`num small${s.low ? " lowv" : ""}`}>
                      {s.rate === null && s.bench === null ? "—" : formatPercent(s.rate)}
                    </span>
                  </div>
                  <span className="r num small">
                    {s.bench === null ? "—" : formatPercent(s.bench, 0)}
                  </span>
                </FragmentRow>
              ))}
            </div>
            <h3 style={{ marginTop: 14 }}>詰まっている段階</h3>
            {stuck.length ? (
              <ul className="small" data-testid="stuck">
                {stuck.map((s) => (
                  <li key={s.key}>
                    <b>{s.label}</b>（{formatPercent(s.rate)}／目安 {formatPercent(s.bench, 0)}）：
                    {s.check}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted" data-testid="stuck">
                目安の8割を下回る段階はありません。
              </p>
            )}
          </section>

          <section className="panel">
            <h2>3つの計測値</h2>
            <div className="tw">
              <table data-testid="three">
                <thead>
                  <tr>
                    <th>媒体</th>
                    <th className="r">媒体報告CV</th>
                    <th className="r">GA4 予約完了</th>
                    <th className="r">Dolphin CREATE 実績（lead_id の予約）</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byMedia].map(([m, v]) => (
                    <tr key={m}>
                      <td>{MEDIA_LABEL[m]}</td>
                      <td className="r num">{formatCount(v.mediaCv)}</td>
                      <td className="r num">{formatCount(v.lead)}</td>
                      <td className="r num">{formatCount(v.res)}</td>
                    </tr>
                  ))}
                  {unknownMedia.length ? (
                    <tr>
                      <td>媒体実績のない広告ID</td>
                      <td className="r num">—</td>
                      <td className="r num">
                        {formatCount(unknownMedia.reduce((a, x) => a + x.f.lead, 0))}
                      </td>
                      <td className="r num">
                        {formatCount(unknownMedia.reduce((a, x) => a + x.f.res, 0))}
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>広告以外・判定不能</td>
                    <td className="r num">—</td>
                    <td className="r num">—</td>
                    <td className="r num">{formatCount(other.res)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              計測の仕組みが違うため、3つの値は一致しません。合算せず、差が大きいときは計測の設定を確かめます。判定できない予約は、どの広告にも割り振りません。
            </p>
          </section>

          <section className="panel">
            <h2>広告別の診断</h2>
            <div className="tw">
              <table data-testid="ads">
                <thead>
                  <tr>
                    <th>広告</th>
                    <th>媒体</th>
                    <th className="r">費用</th>
                    <th className="r">クリック</th>
                    <th className="r">CTR</th>
                    <th className="r">LP</th>
                    <th className="r">予約完了</th>
                    <th className="r">予約</th>
                    <th className="r">来館</th>
                    <th className="r">成約</th>
                    <th className="r">成約単価</th>
                    <th>診断</th>
                    <th>提案</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((a) => {
                    const d = diagnose(a.f, total);
                    const r = recommend(a.f, avgCpc);
                    return (
                      <tr key={a.adId}>
                        <td className="small">
                          {a.name}
                          {a.name !== a.adId ? <span className="tiny"> {a.adId}</span> : null}
                        </td>
                        <td className="small">{a.mediaLabel}</td>
                        <td className="r num">{formatYen(a.f.cost)}</td>
                        <td className="r num">{formatCount(a.f.clicks)}</td>
                        <td className="r num">
                          {formatPercent(ratio(a.f.clicks, a.f.impressions), 2)}
                        </td>
                        <td className="r num">{formatCount(a.f.lp)}</td>
                        <td className="r num">{formatCount(a.f.lead)}</td>
                        <td className="r num">{formatCount(a.f.res)}</td>
                        <td className="r num">{formatCount(a.f.visit)}</td>
                        <td className="r num">{formatCount(a.f.contract)}</td>
                        <td className="r num">{formatYen(ratio(a.f.cost, a.f.contract))}</td>
                        <td>
                          <span className={`pill ${pillOf(d)}`} title={d.note}>
                            {d.label}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${pillOf(r)}`} title={r.note}>
                            {r.label}
                          </span>
                          {r.note ? <span className="tiny"> {r.note}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tiny" style={{ marginBottom: 0 }}>
              来館8件未満の広告は「保留」とします。提案は判断の材料で、予算や配信状態は自動で変えません。
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/** グリッドの1行分（要素をそのまま並べる） */
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
