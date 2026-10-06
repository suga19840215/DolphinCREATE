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
