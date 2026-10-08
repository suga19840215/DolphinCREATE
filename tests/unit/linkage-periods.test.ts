import { describe, expect, it } from "vitest";
import { linkage } from "@/lib/core/linkage";
import { lastFourWeeks, periodRangeUtc } from "@/lib/core/periods";

describe("計測紐付け率", () => {
  it("広告起点 ÷（広告起点＋GA4のみ＋広告以外）", () => {
    const r = linkage({ linkedReservations: 60, otherReservations: 30, ga4GenerateLead: 70 });
    expect(r).toMatchObject({ linked: 60, unjoined: 10, other: 30, total: 100, rate: 0.6 });
  });
  it("予約が0件なら算出不可（null）", () => {
    expect(
      linkage({ linkedReservations: 0, otherReservations: 0, ga4GenerateLead: 0 }).rate,
    ).toBeNull();
  });
});

describe("対象期間", () => {
  it("日本時間の昨日までの28日", () => {
    // 2026-10-06 08:00 JST（= 10-05 23:00 UTC）
    const { current, prior } = lastFourWeeks(new Date("2026-10-05T23:00:00Z"));
    expect(current).toMatchObject({ start: "2026-09-08", end: "2026-10-05" });
    expect(prior).toMatchObject({ start: "2026-08-11", end: "2026-09-07" });
    expect(periodRangeUtc(current)).toEqual({
      from: "2026-09-07T15:00:00.000Z",
      to: "2026-10-05T15:00:00.000Z",
    });
  });
});

import { makePeriod, parsePeriod, periodPresets, previousPeriod } from "@/lib/core/periods";

describe("期間の選択", () => {
  it("前期間は同じ長さで直前", () => {
    expect(previousPeriod(makePeriod("2026-09-01", "2026-09-30"))).toMatchObject({
      start: "2026-08-02",
      end: "2026-08-31",
    });
  });
  it("先月・今月（日本時間）", () => {
    const p = periodPresets(new Date("2026-10-07T23:30:00Z")); // 10/8 08:30 JST
    expect(p.find((x) => x.id === "last-month")!.period).toMatchObject({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(p.find((x) => x.id === "this-month")!.period).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-07",
    });
    expect(p.find((x) => x.id === "90d")!.period).toMatchObject({
      start: "2026-07-10",
      end: "2026-10-07",
    });
  });
  it("おかしな期間は受け付けない", () => {
    expect(parsePeriod("2026-09-30", "2026-09-01")).toBeNull();
    expect(parsePeriod("2026-02-30", "2026-03-01")).toBeNull();
    expect(parsePeriod("2025-01-01", "2026-06-01")).toBeNull();
    expect(parsePeriod("2026-09-01", "2026-09-30")).toMatchObject({ start: "2026-09-01" });
  });
});
