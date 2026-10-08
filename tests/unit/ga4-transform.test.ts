import { describe, expect, it } from "vitest";
import {
  NOT_SET,
  ga4Date,
  isPropertyId,
  landingPath,
  recentDays,
  toFunnelRows,
} from "@/lib/core/ga4/transform";

const r = (dims: string[], v: number) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: [{ value: String(v) }],
});

describe("GA4 の結果を日付×広告ID×LP にまとめる", () => {
  const sessions = {
    rows: [
      r(["20260905", "M-01", "/fair/tasting?utm_source=ig&gclid=x"], 120),
      r(["20260905", "(not set)", "/"], 40),
    ],
  };
  const events = {
    rows: [
      r(["20260905", "M-01", "/fair/tasting?utm_source=ig", "select_fair"], 30),
      r(["20260905", "M-01", "/fair/tasting", "form_start"], 12),
      r(["20260905", "M-01", "/fair/tasting", "generate_lead"], 4),
      r(["20260905", "M-01", "/fair/tasting", "scroll"], 999),
      r(["20260905", "(not set)", "/", "generate_lead"], 1),
    ],
  };
  const rows = toFunnelRows(sessions, events);

  it("クエリを外した同じ LP は1行にまとまる", () => {
    expect(rows.find((x) => x.ad_id === "M-01")).toEqual({
      date: "2026-09-05",
      ad_id: "M-01",
      landing_page: "/fair/tasting",
      lp_sessions: 120,
      view_fair: 0,
      select_fair: 30,
      form_start: 12,
      form_error: 0,
      generate_lead: 4,
    });
  });
  it("計測対象外のイベント（scroll など）は数えない", () => {
    expect(JSON.stringify(rows)).not.toContain("999");
  });
  it("広告IDが取れないセッションは (not set) として分けておく（広告に割り振らない）", () => {
    expect(rows.find((x) => x.ad_id === NOT_SET)).toMatchObject({
      lp_sessions: 40,
      generate_lead: 1,
      landing_page: "/",
    });
  });
});

describe("細かい決まり", () => {
  it("日付", () => {
    expect(ga4Date("20261007")).toBe("2026-10-07");
    expect(ga4Date("2026-10-07")).toBeNull();
  });
  it("LP のパス", () => {
    expect(landingPath("/a/b?x=1#top")).toBe("/a/b");
    expect(landingPath("(not set)")).toBe("");
  });
  it("直近3日（日本時間の昨日まで）", () => {
    expect(recentDays(new Date("2026-10-07T21:30:00Z"), 3)).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-07",
    });
  });
  it("プロパティ ID は数字だけ", () => {
    expect(isPropertyId("123456789")).toBe(true);
    expect(isPropertyId("G-ABC123")).toBe(false);
  });
});
