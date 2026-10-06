import { describe, expect, it } from "vitest";
import { checkAiPayload } from "@/lib/core/ai-guard";

const opts = { facilityId: "fac-A-id", otherFacilityKeys: ["fac-B-id", "fac_B", "会場B"] };

describe("AIへ送る前の検査（受入テスト10の準備）", () => {
  it("1施設の匿名集計と伏せ字の根拠発言だけなら問題なし", () => {
    const payload = {
      facility_id: "fac-A-id",
      priorities: [{ label: "料理・試食の満足", n: 42, quote: "資料は［電話］に送ってほしい" }],
    };
    expect(checkAiPayload(payload, opts)).toEqual([]);
  });

  it("他施設のID・コード・名前が混ざれば止める", () => {
    const payload = { facility_id: "fac-A-id", competitors: ["会場B と比較中"], ref: "fac_B" };
    expect(checkAiPayload(payload, opts).map((i) => i.kind)).toEqual([
      "other_facility",
      "other_facility",
    ]);
  });

  it("施設IDが違えば止める", () => {
    expect(checkAiPayload({ facility_id: "fac-B-id" }, opts).map((i) => i.kind)).toContain(
      "facility_mismatch",
    );
  });

  it("メール・電話番号が混ざれば止める", () => {
    const payload = {
      facility_id: "fac-A-id",
      quotes: ["連絡は taro@example.com か 090-1234-5678 へ"],
    };
    expect(checkAiPayload(payload, opts).map((i) => i.kind)).toEqual(["email", "phone"]);
  });
});
