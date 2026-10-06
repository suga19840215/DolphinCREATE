import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/core/import/csv";
import { autoMap } from "@/lib/core/import/fields";
import { isPiiHeader } from "@/lib/core/import/mask";
import { normalizeDate, parseNumber, validateImport } from "@/lib/core/import/validate";

const [head, ...rows] = parseCsv(
  readFileSync("seed/samples/dolphin_consult_sample_fac_A.csv", "utf8"),
);
const map = autoMap("consultation", head!, isPiiHeader);

describe("接客データの検証（試作版のサンプルCSVと同じ結果）", () => {
  const v = validateImport("consultation", head!, rows, map, {
    facilityKeys: ["fac_A"],
    existingKeys: new Set(),
  });

  it("14行のうち、取込可10・必須欠損1・同意なし1・重複1・他施設1", () => {
    expect(v.total).toBe(14);
    expect(v.ok.length).toBe(10);
    expect(v.missing).toEqual([4]); // lead_id が空
    expect(v.noConsent).toEqual([7]); // consent_ad = 0
    expect(v.duplicate).toEqual([12]); // A-X905 が2回目
    expect(v.wrongFacility).toEqual([13]); // fac_B の行
  });

  it("個人情報の列（email）は対応付けず、取込不可として数える", () => {
    expect(v.piiColumns).toEqual(["email"]);
    expect(Object.values(map)).not.toContain(head!.indexOf("email"));
  });

  it("発言内の連絡先の伏せ字は1行", () => expect(v.maskedRows).toBe(1));

  it("登録済みの接客IDは重複として除外する", () => {
    const v2 = validateImport("consultation", head!, rows, map, {
      facilityKeys: ["fac_A"],
      existingKeys: new Set(["A-X900", "A-X901"]),
    });
    expect(v2.duplicate).toEqual([0, 1, 12]);
    expect(v2.ok.length).toBe(8);
  });

  it("必須の項目が対応付けられていなければ全行が欠損", () => {
    const v3 = validateImport(
      "consultation",
      head!,
      rows,
      { ...map, consent_ad: -1 },
      {
        facilityKeys: ["fac_A"],
        existingKeys: new Set(),
      },
    );
    expect(v3.missing.length).toBe(14);
  });
});

describe("広告実績・CRM", () => {
  const h = ["日", "広告 ID", "広告名", "表示回数", "クリック数", "費用", "コンバージョン"];
  const m = autoMap("ads", h);
  it("Google 広告の日本語の見出しを自動で対応付ける", () => {
    expect(m).toMatchObject({
      date: 0,
      ad_id: 1,
      ad_name: 2,
      impressions: 3,
      clicks: 4,
      cost: 5,
      conversions: 6,
    });
  });
  it("登録済みの日付×広告は上書き、ファイル内の重複は除外、読めない日付・数値は不可", () => {
    const r = [
      ["2026/09/01", "G-01", "a", "100", "5", "1,234", "1"],
      ["2026/09/01", "G-01", "a", "100", "5", "1,234", "1"],
      ["2026/09/02", "G-01", "a", "100", "5", "abc", "1"],
      ["2026/13/40", "G-02", "b", "1", "1", "1", "0"],
      ["2026-09-02", "G-02", "b", "1", "1", "¥10", "0"],
    ];
    const v = validateImport("ads", h, r, m, {
      facilityKeys: [],
      existingKeys: new Set(["2026-09-02|G-02"]),
    });
    expect(v.ok).toEqual([0, 4]);
    expect(v.duplicate).toEqual([1]);
    expect(v.invalid.map((x) => x.row)).toEqual([2, 3]);
    expect(v.updates).toEqual([4]);
  });
  it("CRM：登録済みの lead_id は新しい状況で更新する", () => {
    const hh = ["lead_id", "facility_id", "成約結果", "氏名"];
    const mm = autoMap("crm", hh, isPiiHeader);
    const v = validateImport(
      "crm",
      hh,
      [
        ["L-1", "fac_A", "成約", "山田"],
        ["L-2", "fac_A", "見積中", "佐藤"],
      ],
      mm,
      {
        facilityKeys: ["fac_A"],
        existingKeys: new Set(["L-1"]),
      },
    );
    expect(v.ok).toEqual([0, 1]);
    expect(v.updates).toEqual([0]);
    expect(v.piiColumns).toEqual(["氏名"]);
  });
});

describe("日付・数値", () => {
  it("日付", () => {
    expect(normalizeDate("2026/9/1")).toBe("2026-09-01");
    expect(normalizeDate("2026年9月1日")).toBe("2026-09-01");
    expect(normalizeDate("2026-02-30")).toBeNull();
  });
  it("数値", () => {
    expect(parseNumber("¥1,234")).toBe(1234);
    expect(parseNumber("--")).toBe(0);
    expect(parseNumber("x")).toBeNull();
  });
});
