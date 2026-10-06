import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/core/import/csv";
import { autoMap } from "@/lib/core/import/fields";
import { isPiiHeader } from "@/lib/core/import/mask";
import { normalizeRows, parseOutcome, toIsoDateTime } from "@/lib/core/import/normalize";
import { validateImport } from "@/lib/core/import/validate";

describe("取り込む形への変換", () => {
  it("時刻帯のない日時は日本時間（保存は UTC）", () => {
    expect(toIsoDateTime("2026-09-10 11:00")).toBe("2026-09-10T02:00:00.000Z");
    expect(toIsoDateTime("2026/9/10")).toBe("2026-09-09T15:00:00.000Z");
    expect(toIsoDateTime("2026-09-10T11:00:00Z")).toBe("2026-09-10T11:00:00.000Z");
    expect(toIsoDateTime("あした")).toBeNull();
  });
  it("成約結果は成約／非成約／見積中を分け、見積中を非成約に混ぜない", () => {
    expect(parseOutcome("1")).toBe("contracted");
    expect(parseOutcome("非成約")).toBe("not_contracted");
    expect(parseOutcome("見積中")).toBe("pending");
    expect(parseOutcome("")).toBeNull();
  });

  it("サンプルCSV：個人情報の列は含まれず、発言は伏せ字", () => {
    const [head, ...rows] = parseCsv(
      readFileSync("seed/samples/dolphin_consult_sample_fac_A.csv", "utf8"),
    );
    const map = autoMap("consultation", head!, isPiiHeader);
    const v = validateImport("consultation", head!, rows, map, {
      facilityKeys: ["fac_A"],
      existingKeys: new Set(),
    });
    const out = normalizeRows("consultation", rows, map, v);
    expect(out).toHaveLength(10);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/@example\.com/);
    expect(json).not.toMatch(/090-1234-5678/);
    expect(out.find((r) => r.external_id === "A-X902")?.quote_masked).toContain("［電話］");
    expect(out[0]).toMatchObject({
      external_id: "A-X900",
      outcome: "contracted",
      priorities: ["料理・試食の満足", "海の眺望"],
    });
  });

  it("CRM：広告IDを受け取れた予約だけ広告に結びつける", () => {
    const h = ["lead_id", "facility_id", "utm_source", "utm_content", "成約額"];
    const map = autoMap("crm", h);
    const rows = [
      ["L-1", "fac_A", "google", "G-02", "3,500,000"],
      ["L-2", "fac_A", "", "", ""],
    ];
    const v = validateImport("crm", h, rows, map, {
      facilityKeys: ["fac_A"],
      existingKeys: new Set(),
    });
    const out = normalizeRows("crm", rows, map, v);
    expect(out[0]).toMatchObject({ ad_id: "G-02", revenue_yen: 3500000 });
    expect(out[1]).toMatchObject({ ad_id: null, revenue_yen: null });
  });
});
