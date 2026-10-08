import { describe, expect, it } from "vitest";
import { toSiteRows } from "@/lib/core/ga4/site-transform";

const r = (dims: string[], ...m: number[]) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: m.map((v) => ({ value: String(v) })),
});

describe("GA4 の切り口別レポート → site_metric の行", () => {
  it("流入元：チャネルと参照元/メディアを持ち、イベントは件数とセッション数", () => {
    const rows = toSiteRows(
      "channel",
      { rows: [r(["20260905", "Paid Search", "google / cpc"], 300, 280, 250, 900, 36000)] },
      {
        rows: [
          r(["20260905", "Paid Search", "google / cpc", "generate_lead"], 25, 24),
          r(["20260905", "Paid Search", "google / cpc", "scroll"], 999, 999),
        ],
      },
    );
    expect(rows).toEqual([
      {
        date: "2026-09-05",
        dimension: "channel",
        key: "Paid Search",
        sub_key: "google / cpc",
        sessions: 300,
        users: 280,
        new_users: 250,
        page_views: 900,
        engagement_sec: 36000,
        events: { generate_lead: { c: 25, s: 24 } },
      },
    ]);
  });
  it("最初のページ・閲覧ページはクエリを外して合算する", () => {
    const rows = toSiteRows(
      "landing",
      {
        rows: [
          r(["20260905", "/lp/a?utm_source=ig"], 10, 10, 10, 10, 10),
          r(["20260905", "/lp/a?gclid=1"], 5, 5, 5, 5, 5),
        ],
      },
      { rows: [] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "/lp/a", sessions: 15 });
  });
});
