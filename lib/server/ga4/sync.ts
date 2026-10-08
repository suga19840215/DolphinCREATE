import "server-only";
import { createHash } from "node:crypto";
import {
  SITE_BASE_METRICS,
  SITE_DIMENSION_SPECS,
  SITE_EVENT_METRICS,
  toSiteRows,
} from "@/lib/core/ga4/site-transform";
import { FUNNEL_EVENTS, toFunnelRows } from "@/lib/core/ga4/transform";
import { SITE_DIMENSIONS, SITE_EVENTS } from "@/lib/core/site/report";
import { adminClient, userClient } from "../supabase";
import { Ga4Error, runReport } from "./client";

export type SyncRange = { startDate: string; endDate: string };
export type SyncResult =
  | { status: "imported"; rows: number; siteRows: number; updated: number; jobId: string }
  | { status: "unchanged" }
  | { status: "error"; message: string };

const DIMS = [{ name: "date" }, { name: "sessionManualAdContent" }, { name: "landingPage" }];

/** GA4 から1施設・1期間ぶんを取り込む。手動（ログインした人の権限）と自動（日次）の両方で使う。 */
export async function syncGa4(opts: {
  facilityId: string;
  propertyId: string;
  range: SyncRange;
  mode: "manual" | "auto";
}): Promise<SyncResult> {
  const admin = adminClient();
  const writer = opts.mode === "manual" ? await userClient() : admin;
  try {
    const [sessions, events] = await Promise.all([
      runReport(opts.propertyId, {
        dateRanges: [opts.range],
        dimensions: DIMS,
        metrics: [{ name: "sessions" }],
      }),
      runReport(opts.propertyId, {
        dateRanges: [opts.range],
        dimensions: [...DIMS, { name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: { fieldName: "eventName", inListFilter: { values: [...FUNNEL_EVENTS] } },
        },
      }),
    ]);
    const rows = toFunnelRows(sessions, events);

    // ⑤ ホームページでの予約獲得：切り口ごとに「基本の値」と「イベント別（件数・セッション数）」を取る
    const site = (
      await Promise.all(
        SITE_DIMENSIONS.map(async (dim) => {
          const dims = SITE_DIMENSION_SPECS[dim].map((name) => ({ name }));
          const [base, ev] = await Promise.all([
            runReport(opts.propertyId, {
              dateRanges: [opts.range],
              dimensions: dims,
              metrics: SITE_BASE_METRICS.map((name) => ({ name })),
            }),
            runReport(opts.propertyId, {
              dateRanges: [opts.range],
              dimensions: [...dims, { name: "eventName" }],
              metrics: SITE_EVENT_METRICS.map((name) => ({ name })),
              dimensionFilter: {
                filter: { fieldName: "eventName", inListFilter: { values: [...SITE_EVENTS] } },
              },
            }),
          ]);
          return toSiteRows(dim, base, ev);
        }),
      )
    ).flat();

    const hash = createHash("sha256")
      .update(JSON.stringify({ p: opts.propertyId, r: opts.range, rows, site }))
      .digest("hex");

    // 登録済みの行（同じ日×広告×LP）は上書きになる
    const { data: existing } = await writer
      .from("funnel_event")
      .select("date, ad_id, landing_page")
      .eq("facility_id", opts.facilityId)
      .gte("date", opts.range.startDate)
      .lte("date", opts.range.endDate);
    const have = new Set((existing ?? []).map((e) => `${e.date}|${e.ad_id}|${e.landing_page}`));
    const updated = rows.filter((r) => have.has(`${r.date}|${r.ad_id}|${r.landing_page}`)).length;

    const { data: jobId, error } = await writer.rpc("commit_ga4", {
      job: {
        facility_id: opts.facilityId,
        kind: "ga4",
        file_name: `GA4 ${opts.propertyId} ${opts.range.startDate}〜${opts.range.endDate}`,
        file_sha256: hash,
        encoding: "api",
        run_label: opts.mode === "auto" ? "GA4（自動・日次）" : "",
        rows_total: rows.length + site.length,
        rows_ok: rows.length - updated + site.length,
        rows_updated: updated,
        rows_duplicate: 0,
        rows_missing: 0,
        rows_no_consent: 0,
        rows_wrong_facility: 0,
        rows_invalid: 0,
        pii_columns_dropped: [],
        masked_count: 0,
      },
      funnel: rows as never,
      site: site as never,
    });

    if (error?.code === "23505") {
      await mark(opts.facilityId, "ok", null);
      return { status: "unchanged" };
    }
    if (error || !jobId) throw new Error("取り込んだ値を保存できませんでした。");
    await mark(opts.facilityId, "ok", null);
    return { status: "imported", rows: rows.length, siteRows: site.length, updated, jobId };
  } catch (e) {
    const message =
      e instanceof Ga4Error || e instanceof Error ? e.message : "GA4 から取り込めませんでした。";
    await mark(opts.facilityId, "error", message);
    return { status: "error", message };
  }
}

async function mark(facilityId: string, status: "ok" | "error", message: string | null) {
  await adminClient()
    .from("facility_connection")
    .update({
      last_status: status,
      last_error: message,
      ...(status === "ok" ? { last_synced_at: new Date().toISOString() } : {}),
    })
    .eq("facility_id", facilityId)
    .eq("provider", "ga4");
}

/** 毎朝の自動取込：GA4 を登録した全施設の直近の期間 */
export async function syncAllGa4(range: SyncRange) {
  const { data: conns } = await adminClient()
    .from("facility_connection")
    .select("facility_id, account_ref, facility:facility_id (code)")
    .eq("provider", "ga4")
    .eq("enabled", true);
  const results: { facility: string; result: SyncResult }[] = [];
  for (const c of conns ?? []) {
    results.push({
      facility: c.facility?.code ?? c.facility_id,
      result: await syncGa4({
        facilityId: c.facility_id,
        propertyId: c.account_ref,
        range,
        mode: "auto",
      }),
    });
  }
  return results;
}
