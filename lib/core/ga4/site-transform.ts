// GA4 の切り口別レポートを、site_metric の行にする（⑤ ホームページでの予約獲得）。
import { SITE_EVENTS, type SiteDimension, type SiteRow } from "../site/report";
import { ga4Date, landingPath, type Report } from "./transform";

/** 切り口ごとの GA4 の次元（先頭は必ず date） */
export const SITE_DIMENSION_SPECS: Record<SiteDimension, string[]> = {
  channel: ["date", "sessionDefaultChannelGroup", "sessionSourceMedium"],
  landing: ["date", "landingPage"],
  device: ["date", "deviceCategory"],
  region: ["date", "region"],
  newret: ["date", "newVsReturning"],
  hour: ["date", "hour"],
  page: ["date", "pagePath"],
};

export const SITE_BASE_METRICS = [
  "sessions",
  "totalUsers",
  "newUsers",
  "screenPageViews",
  "userEngagementDuration",
];
/** イベント別のレポート：件数と、そのイベントが起きたセッション数 */
export const SITE_EVENT_METRICS = ["eventCount", "sessions"];

const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};

function keyOf(dimension: SiteDimension, values: string[]): { key: string; sub: string } {
  const [, a = "", b = ""] = values;
  if (dimension === "landing" || dimension === "page")
    return { key: landingPath(a) || "/", sub: "" };
  if (dimension === "channel") return { key: a.slice(0, 300), sub: b.slice(0, 300) };
  return { key: a.slice(0, 300), sub: "" };
}

export function toSiteRows(dimension: SiteDimension, base: Report, events: Report): SiteRow[] {
  const map = new Map<string, SiteRow>();
  const get = (values: string[]) => {
    const date = ga4Date(values[0] ?? "");
    if (!date) return null;
    const { key, sub } = keyOf(dimension, values);
    const id = `${date}|${key}|${sub}`;
    let row = map.get(id);
    if (!row) {
      row = {
        date,
        dimension,
        key,
        sub_key: sub,
        sessions: 0,
        users: 0,
        new_users: 0,
        page_views: 0,
        engagement_sec: 0,
        events: {},
      };
      map.set(id, row);
    }
    return row;
  };
  for (const r of base.rows ?? []) {
    const row = get(r.dimensionValues.map((x) => x.value));
    if (!row) continue;
    const [s, u, nu, pv, eng] = r.metricValues.map((x) => x.value);
    row.sessions += n(s);
    row.users += n(u);
    row.new_users += n(nu);
    row.page_views += n(pv);
    row.engagement_sec += n(eng);
  }
  for (const r of events.rows ?? []) {
    const values = r.dimensionValues.map((x) => x.value);
    const event = values[values.length - 1] as (typeof SITE_EVENTS)[number];
    if (!(SITE_EVENTS as readonly string[]).includes(event)) continue;
    const row = get(values.slice(0, -1));
    if (!row) continue;
    const prev = row.events[event] ?? { c: 0, s: 0 };
    row.events[event] = {
      c: prev.c + n(r.metricValues[0]?.value),
      s: prev.s + n(r.metricValues[1]?.value),
    };
  }
  return [...map.values()];
}
