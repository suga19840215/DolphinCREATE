// ⑤「ホームページでの予約獲得（GA4）」の集計。画面・Excel・AI への入力のどこから使っても同じ結果にする。
// 元のデータは GA4 の日別×切り口（流入元・最初のページ・端末・エリア・新規/再訪・時間帯・閲覧ページ）の行。
import { ratio } from "../format";
import { CHANNELS, classifyChannel, type Channel } from "./channels";
import { matchPage, type PageKind, type PageRule } from "./pages";

/** GA4 から取り込むイベント。予約完了と、資料請求・問い合わせは分けて数える */
export const SITE_EVENTS = [
  "view_fair",
  "select_fair",
  "form_start",
  "form_error",
  "generate_lead",
  "request_brochure",
  "contact",
  "click_tel",
  "click_line",
] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];

export const SITE_DIMENSIONS = [
  "channel",
  "landing",
  "device",
  "region",
  "newret",
  "hour",
  "page",
] as const;
export type SiteDimension = (typeof SITE_DIMENSIONS)[number];

/** イベントごとの件数（c）と、そのイベントが起きたセッション数（s） */
export type EventCounts = Partial<Record<SiteEvent, { c: number; s: number }>>;

export type SiteRow = {
  date: string; // YYYY-MM-DD（日本時間の日付）
  dimension: SiteDimension;
  key: string;
  sub_key: string;
  sessions: number;
  users: number;
  new_users: number;
  page_views: number;
  engagement_sec: number;
  events: EventCounts;
};

type Acc = {
  sessions: number;
  users: number;
  pageViews: number;
  engagementSec: number;
  ev: Record<SiteEvent, { c: number; s: number }>;
};

const emptyAcc = (): Acc => ({
  sessions: 0,
  users: 0,
  pageViews: 0,
  engagementSec: 0,
  ev: Object.fromEntries(SITE_EVENTS.map((e) => [e, { c: 0, s: 0 }])) as Acc["ev"],
});

function add(acc: Acc, r: SiteRow) {
  acc.sessions += r.sessions;
  acc.users += r.users;
  acc.pageViews += r.page_views;
  acc.engagementSec += r.engagement_sec;
  for (const e of SITE_EVENTS) {
    const v = r.events[e];
    if (v) {
      acc.ev[e].c += v.c;
      acc.ev[e].s += v.s;
    }
  }
}

function group<K extends string>(
  rows: readonly SiteRow[],
  keyOf: (r: SiteRow) => K | null,
): Map<K, Acc> {
  const m = new Map<K, Acc>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === null) continue;
    const acc = m.get(k) ?? emptyAcc();
    add(acc, r);
    m.set(k, acc);
  }
  return m;
}

/** 予約率＝予約完了が起きたセッション ÷ セッション */
const bookingRate = (a: Acc) => ratio(a.ev.generate_lead.s, a.sessions);

export type Outcome = {
  sessions: number;
  bookings: number;
  bookingSessions: number;
  bookingRate: number | null;
};
const outcome = (a: Acc): Outcome => ({
  sessions: a.sessions,
  bookings: a.ev.generate_lead.c,
  bookingSessions: a.ev.generate_lead.s,
  bookingRate: bookingRate(a),
});

const DOW = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type SiteReport = ReturnType<typeof buildSiteReport>;

export function buildSiteReport(rows: readonly SiteRow[], rules: readonly PageRule[]) {
  const by = (d: SiteDimension) => rows.filter((r) => r.dimension === d);
  // 全体の値は「端末別」の合計を使う（すべてのセッションに端末がある）
  const total = emptyAcc();
  for (const r of by("device")) add(total, r);

  // フェア・見学予約の完了（資料請求・問い合わせとは分ける）
  const completion = {
    ...outcome(total),
    brochure: total.ev.request_brochure.c,
    contact: total.ev.contact.c,
    tel: total.ev.click_tel.c,
    line: total.ev.click_line.c,
  };

  // 流入元別の予約成果
  const ch = group(by("channel"), (r) => classifyChannel(r.key, r.sub_key));
  const channels = CHANNELS.filter((c) => ch.has(c)).map((c) => ({
    channel: c as Channel,
    ...outcome(ch.get(c)!),
  }));
  const channelDetail = [
    ...group(by("channel"), (r) => `${classifyChannel(r.key, r.sub_key)}|${r.sub_key}`),
  ]
    .map(([k, a]) => {
      const [channel, sourceMedium] = k.split("|");
      return { channel: channel as Channel, sourceMedium: sourceMedium!, ...outcome(a) };
    })
    .sort((x, y) => y.sessions - x.sessions);

  // 予約までの途中離脱（その段階に到達したセッション数と、前の段階からの離脱率）
  const steps = [
    ["view_fair", "フェア詳細閲覧"],
    ["select_fair", "予約ボタン"],
    ["form_start", "フォーム入力開始"],
    ["generate_lead", "予約完了"],
  ] as const;
  const funnel = steps.map(([e, label], i) => {
    const reach = total.ev[e].s;
    const prev = i ? total.ev[steps[i - 1]![0]].s : null;
    return {
      event: e,
      label,
      reach,
      passRate: prev === null ? null : ratio(reach, prev),
      dropRate: prev === null ? null : prev > 0 ? 1 - reach / prev : null,
    };
  });
  const formErrorRate = ratio(total.ev.form_error.s, total.ev.form_start.s);

  // 最初に訪れたページ別の成果
  const landing = [...group(by("landing"), (r) => matchPage(r.key, rules).label)]
    .map(([label, a]) => {
      const sample = by("landing").find((r) => matchPage(r.key, rules).label === label)!;
      const m = matchPage(sample.key, rules);
      return { label, kind: m.kind, matched: m.matched, ...outcome(a) };
    })
    .sort((x, y) => y.sessions - x.sessions);

  // フェア・プラン別／コンテンツ別（閲覧と、そのページからの予約ボタン）
  const pages = (kinds: readonly PageKind[]) =>
    [
      ...group(by("page"), (r) => {
        const m = matchPage(r.key, rules);
        return kinds.includes(m.kind) ? m.label : null;
      }),
    ]
      .map(([label, a]) => ({
        label,
        views: a.pageViews,
        users: a.users,
        sessions: a.sessions,
        avgEngagementSec: ratio(a.engagementSec, a.pageViews),
        reserveClicks: a.ev.select_fair.c,
        reserveClickSessions: a.ev.select_fair.s,
        reserveClickRate: ratio(a.ev.select_fair.s, a.sessions),
      }))
      .sort((x, y) => y.views - x.views);
  const fairPlan = pages(["fair", "plan"]);
  const content = pages(["content"]);
  const unclassifiedPages = [
    ...group(by("page"), (r) =>
      matchPage(r.key, rules).matched ? null : matchPage(r.key, rules).label,
    ),
  ]
    .map(([path, a]) => ({ path, views: a.pageViews }))
    .sort((x, y) => y.views - x.views)
    .slice(0, 20);

  // スマートフォンでの使いやすさ
  const DEVICE_LABEL: Record<string, string> = {
    mobile: "スマートフォン",
    desktop: "パソコン",
    tablet: "タブレット",
  };
  const devices = [...group(by("device"), (r) => r.key.toLowerCase())]
    .map(([d, a]) => ({
      device: DEVICE_LABEL[d] ?? d,
      ...outcome(a),
      formStarts: a.ev.form_start.s,
      formAbandonRate: a.ev.form_start.s > 0 ? 1 - a.ev.generate_lead.s / a.ev.form_start.s : null,
      formErrorRate: ratio(a.ev.form_error.s, a.ev.form_start.s),
    }))
    .sort((x, y) => y.sessions - x.sessions);

  // エリア別の成果
  const regions = [...group(by("region"), (r) => (r.key && r.key !== "(not set)" ? r.key : "不明"))]
    .map(([region, a]) => ({ region, ...outcome(a) }))
    .sort((x, y) => y.sessions - x.sessions);

  // 再訪問（新規／再訪）
  const NR: Record<string, string> = { new: "新規", returning: "再訪問" };
  const newReturning = [...group(by("newret"), (r) => NR[r.key] ?? "不明")]
    .map(([kind, a]) => ({ kind, ...outcome(a) }))
    .sort((x) => (x.kind === "新規" ? -1 : 1));

  // 時期・曜日・時間帯
  const months = [...group(by("device"), (r) => r.date.slice(0, 7))]
    .map(([month, a]) => ({ month, ...outcome(a) }))
    .sort((x, y) => x.month.localeCompare(y.month));
  const dowMap = group(by("device"), (r) => String(new Date(`${r.date}T00:00:00Z`).getUTCDay()));
  const daysOfWeek = DOW.map((label, i) => ({
    label,
    ...outcome(dowMap.get(String(i)) ?? emptyAcc()),
  }));
  const hourMap = group(by("hour"), (r) => String(Number(r.key)));
  const hours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    ...outcome(hourMap.get(String(h)) ?? emptyAcc()),
  }));

  return {
    completion,
    channels,
    channelDetail,
    funnel,
    formErrorRate,
    landing,
    fairPlan,
    content,
    unclassifiedPages,
    devices,
    regions,
    newReturning,
    months,
    daysOfWeek,
    hours,
    hasData: rows.length > 0,
  };
}
