import { describe, expect, it } from "vitest";
import { buildSiteReport, type SiteRow } from "@/lib/core/site/report";

const row = (p: Partial<SiteRow> & Pick<SiteRow, "dimension" | "key">): SiteRow => ({
  date: "2026-09-05", // 土曜日
  sub_key: "",
  sessions: 0,
  users: 0,
  new_users: 0,
  page_views: 0,
  engagement_sec: 0,
  events: {},
  ...p,
});

const rows: SiteRow[] = [
  // 端末（全体の値はここから）
  row({
    dimension: "device",
    key: "mobile",
    sessions: 800,
    events: {
      view_fair: { c: 500, s: 400 },
      select_fair: { c: 150, s: 120 },
      form_start: { c: 90, s: 80 },
      form_error: { c: 30, s: 20 },
      generate_lead: { c: 40, s: 40 },
      request_brochure: { c: 12, s: 12 },
      contact: { c: 5, s: 5 },
    },
  }),
  row({
    dimension: "device",
    key: "desktop",
    sessions: 200,
    date: "2026-09-07",
    events: {
      view_fair: { c: 100, s: 100 },
      select_fair: { c: 40, s: 40 },
      form_start: { c: 20, s: 20 },
      generate_lead: { c: 16, s: 16 },
    },
  }),
  // 流入元
  row({
    dimension: "channel",
    key: "Paid Search",
    sub_key: "google / cpc",
    sessions: 300,
    events: { generate_lead: { c: 24, s: 24 } },
  }),
  row({
    dimension: "channel",
    key: "Paid Social",
    sub_key: "instagram / paid_social",
    sessions: 400,
    events: { generate_lead: { c: 12, s: 12 } },
  }),
  row({
    dimension: "channel",
    key: "Referral",
    sub_key: "zexy.net / referral",
    sessions: 100,
    events: { generate_lead: { c: 10, s: 10 } },
  }),
  row({
    dimension: "channel",
    key: "Organic Search",
    sub_key: "google / organic",
    sessions: 200,
    events: { generate_lead: { c: 10, s: 10 } },
  }),
  // 最初のページ
  row({ dimension: "landing", key: "/", sessions: 300, events: { generate_lead: { c: 6, s: 6 } } }),
  row({
    dimension: "landing",
    key: "/lp/tasting",
    sessions: 500,
    events: { generate_lead: { c: 40, s: 40 } },
  }),
  row({
    dimension: "landing",
    key: "/lp/small",
    sessions: 200,
    events: { generate_lead: { c: 10, s: 10 } },
  }),
  // 閲覧ページ
  row({
    dimension: "page",
    key: "/fair/tasting",
    sessions: 300,
    users: 280,
    page_views: 400,
    engagement_sec: 24000,
    events: { select_fair: { c: 90, s: 75 } },
  }),
  row({
    dimension: "page",
    key: "/chapel",
    sessions: 250,
    users: 240,
    page_views: 300,
    engagement_sec: 9000,
    events: { select_fair: { c: 10, s: 10 } },
  }),
  row({ dimension: "page", key: "/access", sessions: 50, page_views: 60 }),
  // エリア・新規/再訪・時間帯
  row({
    dimension: "region",
    key: "Kanagawa",
    sessions: 600,
    events: { generate_lead: { c: 40, s: 40 } },
  }),
  row({ dimension: "region", key: "(not set)", sessions: 10 }),
  row({
    dimension: "newret",
    key: "new",
    sessions: 700,
    events: { generate_lead: { c: 20, s: 20 } },
  }),
  row({
    dimension: "newret",
    key: "returning",
    sessions: 300,
    events: { generate_lead: { c: 36, s: 36 } },
  }),
  row({ dimension: "hour", key: "21", sessions: 150, events: { generate_lead: { c: 12, s: 12 } } }),
];
const rules = [
  { prefix: "/lp/tasting", label: "広告LP（試食）", kind: "landing" as const },
  { prefix: "/lp/small", label: "少人数プラン LP", kind: "landing" as const },
  { prefix: "/fair/tasting", label: "試食フェア", kind: "fair" as const },
  { prefix: "/chapel", label: "チャペル", kind: "content" as const },
];
const r = buildSiteReport(rows, rules);

describe("⑤ ホームページでの予約獲得（GA4）", () => {
  it("予約完了：件数・予約が起きたセッションの割合。資料請求・問い合わせは分けて数える", () => {
    expect(r.completion).toMatchObject({
      sessions: 1000,
      bookings: 56,
      bookingSessions: 56,
      brochure: 12,
      contact: 5,
    });
    expect(r.completion.bookingRate).toBeCloseTo(0.056);
  });

  it("流入元別：広告・自然検索・紹介サイトに分ける", () => {
    expect(r.channels.map((c) => [c.channel, c.sessions, c.bookings])).toEqual([
      ["Google広告", 300, 24],
      ["Instagram広告", 400, 12],
      ["自然検索", 200, 10],
      ["式場紹介サイト", 100, 10],
    ]);
    expect(r.channels.find((c) => c.channel === "式場紹介サイト")!.bookingRate).toBeCloseTo(0.1);
  });

  it("途中離脱：到達セッション数と、前の段階からの離脱率", () => {
    expect(r.funnel.map((s) => [s.label, s.reach])).toEqual([
      ["フェア詳細閲覧", 500],
      ["予約ボタン", 160],
      ["フォーム入力開始", 100],
      ["予約完了", 56],
    ]);
    expect(r.funnel[1]!.dropRate).toBeCloseTo(0.68);
    expect(r.funnel[3]!.dropRate).toBeCloseTo(0.44);
    expect(r.funnel[0]!.dropRate).toBeNull();
  });

  it("最初のページ：登録した名前でまとめる", () => {
    expect(r.landing.map((l) => [l.label, l.sessions, l.bookings])).toEqual([
      ["広告LP（試食）", 500, 40],
      ["TOP", 300, 6],
      ["少人数プラン LP", 200, 10],
    ]);
  });

  it("フェア・プラン別とコンテンツ別：閲覧と、そのページからの予約ボタン", () => {
    expect(r.fairPlan).toEqual([
      expect.objectContaining({
        label: "試食フェア",
        views: 400,
        reserveClicks: 90,
        reserveClickRate: 0.25,
        avgEngagementSec: 60,
      }),
    ]);
    expect(r.content).toEqual([
      expect.objectContaining({ label: "チャペル", views: 300, reserveClicks: 10 }),
    ]);
    expect(r.unclassifiedPages).toEqual([{ path: "/access", views: 60 }]);
  });

  it("スマートフォン：予約率とフォーム離脱率", () => {
    const sp = r.devices.find((d) => d.device === "スマートフォン")!;
    expect(sp.bookingRate).toBeCloseTo(0.05);
    expect(sp.formAbandonRate).toBeCloseTo(0.5);
    expect(sp.formErrorRate).toBeCloseTo(0.25);
    expect(r.devices.find((d) => d.device === "パソコン")!.formAbandonRate).toBeCloseTo(0.2);
  });

  it("エリア・新規／再訪・曜日・時間帯", () => {
    expect(r.regions.map((x) => x.region)).toEqual(["Kanagawa", "不明"]);
    expect(r.newReturning.map((x) => [x.kind, x.bookingRate])).toEqual([
      ["新規", 20 / 700],
      ["再訪問", 0.12],
    ]);
    expect(r.daysOfWeek.find((d) => d.label === "土")!.sessions).toBe(800);
    expect(r.daysOfWeek.find((d) => d.label === "月")!.sessions).toBe(200);
    expect(r.hours[21]!.bookings).toBe(12);
    expect(r.months).toEqual([expect.objectContaining({ month: "2026-09", sessions: 1000 })]);
  });

  it("データがなければ、率は算出不可（null）", () => {
    const e = buildSiteReport([], []);
    expect(e.hasData).toBe(false);
    expect(e.completion.bookingRate).toBeNull();
    expect(e.funnel[1]!.dropRate).toBeNull();
  });
});
