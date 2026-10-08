// GA4 Data API（runReport）の結果を、funnel_event の行（日付×広告ID×LP）にまとめる。
// 取り込むのは GA4 の値だけ。媒体報告・CRM の値とは混ぜない。

export const FUNNEL_EVENTS = [
  "view_fair",
  "select_fair",
  "form_start",
  "form_error",
  "generate_lead",
] as const;
export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

/** GA4 で広告IDが取れない（utm_content がない）セッションの印 */
export const NOT_SET = "(not set)";

export type ReportRow = { dimensionValues: { value: string }[]; metricValues: { value: string }[] };
export type Report = { rows?: ReportRow[]; rowCount?: number };

export type FunnelRow = {
  date: string;
  ad_id: string;
  landing_page: string;
  lp_sessions: number;
  view_fair: number;
  select_fair: number;
  form_start: number;
  form_error: number;
  generate_lead: number;
};

/** 20260905 → 2026-09-05 */
export function ga4Date(v: string): string | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** ランディングページは、クエリ（?以降）を外したパスだけにする（個人を特定しうる値を持ち込まない） */
export function landingPath(v: string): string {
  const s = (v || "").trim();
  if (!s || s === NOT_SET) return "";
  return s.split("?")[0]!.split("#")[0]!.slice(0, 300);
}

function adId(v: string): string {
  const s = (v || "").trim();
  return s && s !== NOT_SET ? s.slice(0, 200) : NOT_SET;
}

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/**
 * sessions：次元 [date, sessionManualAdContent, landingPage]、指標 [sessions]
 * events：次元 [date, sessionManualAdContent, landingPage, eventName]、指標 [eventCount]
 */
export function toFunnelRows(sessions: Report, events: Report): FunnelRow[] {
  const map = new Map<string, FunnelRow>();
  const get = (dateRaw: string, adRaw: string, lpRaw: string) => {
    const date = ga4Date(dateRaw);
    if (!date) return null;
    const key = `${date}|${adId(adRaw)}|${landingPath(lpRaw)}`;
    let row = map.get(key);
    if (!row) {
      row = {
        date,
        ad_id: adId(adRaw),
        landing_page: landingPath(lpRaw),
        lp_sessions: 0,
        view_fair: 0,
        select_fair: 0,
        form_start: 0,
        form_error: 0,
        generate_lead: 0,
      };
      map.set(key, row);
    }
    return row;
  };
  for (const r of sessions.rows ?? []) {
    const [d, a, l] = r.dimensionValues.map((x) => x.value);
    const row = get(d ?? "", a ?? "", l ?? "");
    if (row) row.lp_sessions += num(r.metricValues[0]?.value ?? "0");
  }
  for (const r of events.rows ?? []) {
    const [d, a, l, e] = r.dimensionValues.map((x) => x.value);
    if (!(FUNNEL_EVENTS as readonly string[]).includes(e ?? "")) continue;
    const row = get(d ?? "", a ?? "", l ?? "");
    if (row) row[e as FunnelEventName] += num(r.metricValues[0]?.value ?? "0");
  }
  return [...map.values()].sort((x, y) =>
    x.date === y.date
      ? (x.ad_id + x.landing_page).localeCompare(y.ad_id + y.landing_page)
      : x.date.localeCompare(y.date),
  );
}

/** 取り込む期間：日本時間の昨日までの days 日（GA4 は数日遅れて確定するので、毎日直近3日を取り直す） */
export function recentDays(now: Date, days: number): { startDate: string; endDate: string } {
  const DAY = 86_400_000;
  const tokyo = (t: number) => new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
  return { startDate: tokyo(now.getTime() - days * DAY), endDate: tokyo(now.getTime() - DAY) };
}

/** GA4 プロパティ ID（数字だけ） */
export const isPropertyId = (v: string) => /^\d{6,15}$/.test(v);
