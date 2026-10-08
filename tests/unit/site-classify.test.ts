import { describe, expect, it } from "vitest";
import { classifyChannel } from "@/lib/core/site/channels";
import { matchPage, normalizePath, validRule } from "@/lib/core/site/pages";

describe("流入元の分け方", () => {
  it.each([
    ["Paid Search", "google / cpc", "Google広告"],
    ["Cross-network", "google / cpc", "Google広告"],
    ["Paid Social", "instagram / paid_social", "Instagram広告"],
    ["Paid Social", "ig / cpc", "Instagram広告"],
    ["Paid Other", "yahoo / cpc", "その他の広告"],
    ["Organic Search", "google / organic", "自然検索"],
    ["Referral", "zexy.net / referral", "式場紹介サイト"],
    ["Referral", "weddingpark.net / referral", "式場紹介サイト"],
    ["Referral", "example-blog.jp / referral", "他サイトからのリンク"],
    ["Organic Social", "instagram / social", "SNS（広告以外）"],
    ["Referral", "l.instagram.com / referral", "SNS（広告以外）"],
    ["Direct", "(direct) / (none)", "直接"],
    ["Email", "newsletter / email", "メール"],
    ["Unassigned", "x / y", "その他"],
  ])("%s ・ %s → %s", (group, sm, want) => expect(classifyChannel(group, sm)).toBe(want));
});

describe("ページの分類（前方一致・いちばん長い一致）", () => {
  const rules = [
    { prefix: "/fair", label: "フェア一覧", kind: "fair" as const },
    { prefix: "/fair/tasting", label: "試食フェア", kind: "fair" as const },
    { prefix: "/plan/small", label: "少人数プラン", kind: "plan" as const },
    { prefix: "/chapel", label: "チャペル", kind: "content" as const },
    { prefix: "/lp/", label: "広告LP", kind: "landing" as const },
  ];
  it("長く一致したほうを使う", () => {
    expect(matchPage("/fair/tasting/2026-11?utm_source=ig", rules)).toEqual({
      label: "試食フェア",
      kind: "fair",
      matched: true,
    });
    expect(matchPage("/fair/chapel-tour", rules)).toEqual({
      label: "フェア一覧",
      kind: "fair",
      matched: true,
    });
  });
  it("途中までの一致はしない（/chapel と /chapelxyz は別）", () => {
    expect(matchPage("/chapelxyz", rules).matched).toBe(false);
  });
  it("登録がなければ TOP かパスのまま", () => {
    expect(matchPage("/", rules)).toEqual({ label: "TOP", kind: "top", matched: false });
    expect(matchPage("/access/", rules)).toEqual({
      label: "/access",
      kind: "other",
      matched: false,
    });
  });
  it("パスの形をそろえる", () => expect(normalizePath("/LP/Summer/?a=1")).toBe("/lp/summer"));
  it("登録の決まり", () => {
    expect(validRule({ prefix: "fair", label: "x", kind: "fair" })).toMatch(/で始まる/);
    expect(validRule({ prefix: "/fair", label: "", kind: "fair" })).toMatch(/名前/);
    expect(validRule({ prefix: "/fair", label: "フェア", kind: "fair" })).toBeNull();
  });
});
