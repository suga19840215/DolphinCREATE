import "server-only";
import { emptyFunnel, type AdFunnel } from "@/lib/core/funnel";
import { periodRangeUtc, type Period } from "@/lib/core/periods";
import type { PageRule } from "@/lib/core/site/pages";
import type { SiteRow } from "@/lib/core/site/report";
import { MEDIA_LABEL, type Media } from "../imports";
import { userClient } from "../supabase";

type Client = Awaited<ReturnType<typeof userClient>>;

/** 1回の問い合わせの上限を超えても全行を読む（ページ送り） */
async function all<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw new Error("レポートのデータを読み込めませんでした。");
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function loadSiteRows(
  supabase: Client,
  facilityId: string,
  p: Period,
): Promise<SiteRow[]> {
  const rows = await all((from, to) =>
    supabase
      .from("site_metric")
      .select(
        "date, dimension, key, sub_key, sessions, users, new_users, page_views, engagement_sec, events",
      )
      .eq("facility_id", facilityId)
      .gte("date", p.start)
      .lte("date", p.end)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    ...r,
    dimension: r.dimension as SiteRow["dimension"],
    sessions: Number(r.sessions),
    users: Number(r.users),
    new_users: Number(r.new_users),
    page_views: Number(r.page_views),
    engagement_sec: Number(r.engagement_sec),
    events: (r.events ?? {}) as SiteRow["events"],
  }));
}

export async function loadPageRules(
  supabase: Client,
  facilityId: string,
): Promise<(PageRule & { id: string })[]> {
  const { data } = await supabase
    .from("page_category")
    .select("id, prefix, label, kind")
    .eq("facility_id", facilityId)
    .order("prefix");
  return (data ?? []) as (PageRule & { id: string })[];
}

export type AdLine = {
  adId: string;
  media: Media | null;
  mediaLabel: string;
  name: string;
  f: AdFunnel;
};

/** 広告ごとの、媒体報告・GA4・CRM（予約台帳）の値。混ぜずに別の項目で持つ */
export async function loadAdFunnels(supabase: Client, facilityId: string, p: Period) {
  const range = periodRangeUtc(p);
  const [media, ga4, crm] = await Promise.all([
    all((from, to) =>
      supabase
        .from("media_daily_metric")
        .select("media, ad_id, ad_name, impressions, clicks, cost_yen, media_reported_cv")
        .eq("facility_id", facilityId)
        .gte("date", p.start)
        .lte("date", p.end)
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("funnel_event")
        .select("ad_id, lp_sessions, select_fair, form_start, form_error, generate_lead")
        .eq("facility_id", facilityId)
        .gte("date", p.start)
        .lte("date", p.end)
        .order("id")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("crm_lead")
        .select("ad_id, is_valid, visited_at, outcome, gross_profit_yen")
        .eq("facility_id", facilityId)
        .gte("reserved_at", range.from)
        .lt("reserved_at", range.to)
        .order("id")
        .range(from, to),
    ),
  ]);

  const lines = new Map<string, AdLine>();
  const line = (adId: string) => {
    let l = lines.get(adId);
    if (!l) {
      l = { adId, media: null, mediaLabel: "—", name: adId, f: emptyFunnel() };
      lines.set(adId, l);
    }
    return l;
  };
  for (const m of media) {
    const l = line(m.ad_id);
    l.media = m.media;
    l.mediaLabel = MEDIA_LABEL[m.media];
    if (m.ad_name) l.name = m.ad_name;
    l.f.impressions += Number(m.impressions);
    l.f.clicks += Number(m.clicks);
    l.f.cost += Number(m.cost_yen);
    l.f.mediaCv += Number(m.media_reported_cv);
  }
  for (const g of ga4) {
    if (g.ad_id === "(not set)") continue; // 広告IDが取れないセッションは、どの広告にも割り振らない
    const l = line(g.ad_id);
    l.f.lp += Number(g.lp_sessions);
    l.f.cta += Number(g.select_fair);
    l.f.formStart += Number(g.form_start);
    l.f.formError += Number(g.form_error);
    l.f.lead += Number(g.generate_lead);
  }
  const other = { res: 0, valid: 0, visit: 0, contract: 0 };
  for (const c of crm) {
    const valid = c.is_valid !== false;
    const target = c.ad_id ? line(c.ad_id).f : null;
    const bump = (k: "res" | "valid" | "visit" | "contract") =>
      target ? (target[k] += 1) : (other[k] += 1);
    bump("res");
    if (valid) bump("valid");
    if (valid && c.visited_at) bump("visit");
    if (valid && c.outcome === "contracted") bump("contract");
    if (target && c.outcome === "contracted") target.grossProfit += Number(c.gross_profit_yen ?? 0);
  }
  return {
    ads: [...lines.values()].sort((a, b) => b.f.cost - a.f.cost || a.adId.localeCompare(b.adId)),
    other,
  };
}
