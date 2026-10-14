import { describe, expect, it } from "vitest";
import { evaluateMedia, lastYearMonth, type ResultRow } from "@/lib/core/media/evaluate";
import { axesFromText, mainCustomer, matchLevel } from "@/lib/core/media/match";
import { matchOutlet } from "@/lib/core/media/outlets";
import { parseMonth, parseNumber, parseTable } from "@/lib/core/media/sheet";

describe("掲載媒体の当てはめ", () => {
  it.each([
    ["ゼクシィ本誌", "zexy_magazine"],
    ["ｾﾞｸｼｨ ＮＥＴ", "zexy_net"],
    ["ゼクシィなび（カウンター）", "zexy_navi"],
    ["Wパーク", "wpark"],
    ["ウェディングパーク", "wpark"],
    ["みんなのW", "minna"],
    ["マイナビウェディング", "mynavi"],
    ["ハナユメ", "hanayume"],
    ["Wニュース", "wnews"],
    ["トキハナ", "tokihana"],
    ["プラコレ", "placole"],
    ["阪急ウエディング", "hankyu"],
    ["公式HP", "official"],
    ["HP", "official"],
  ])("%s → %s", (name, code) => expect(matchOutlet(name)).toBe(code));

  it("区分が分からない名前は当てはめない（確認画面で選ぶ）", () => {
    expect(matchOutlet("ゼクシィ")).toBeNull();
    expect(matchOutlet("SHOP")).toBeNull();
  });
});

describe("資料の数・月の読み取り", () => {
  it("金額・件数", () => {
    expect(parseNumber("¥1,200,000")).toBe(1_200_000);
    expect(parseNumber("120万円")).toBe(1_200_000);
    expect(parseNumber("１２件")).toBe(12);
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("未定")).toBeNull();
  });
  it("月", () => {
    expect(parseMonth("2026年9月")).toBe("2026-09");
    expect(parseMonth("2026/10/01")).toBe("2026-10");
    expect(parseMonth("R8.9")).toBe("2026-09");
    expect(parseMonth(new Date("2026-08-31T15:00:00Z"))).toBe("2026-09");
    expect(parseMonth("9月")).toBeNull();
  });
});

describe("表の読み取り", () => {
  const grid = [
    ["2026年9月 掲載実績", "", "", "", "", "", ""],
    ["媒体", "掲載メニュー", "掲載金額", "来館数", "目標来館", "成約数", "来館単価"],
    ["ゼクシィ本誌", "1P", "¥800,000", "20", "25", "6", "40,000"],
    ["", "タイアップ", "200,000", "5", "", "1", ""],
    ["ハナユメ", "スタンダード", "300,000", "12件", "10", "3", ""],
    ["ゼクシィ", "", "100,000", "2", "", "0", ""],
    ["合計", "", "1,400,000", "39", "", "10", ""],
  ];
  const r = parseTable(grid, "2026-09");

  it("見出しを見つけ、媒体・メニュー・金額・来館・目標・成約を読む（単価の列と合計の行は読まない）", () => {
    expect(r.headerFound).toBe(true);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]).toMatchObject({
      kind: "result",
      month: "2026-09",
      outlet: "zexy_magazine",
      menu: "1P",
      cost_yen: 800_000,
      visits: 20,
      target_visits: 25,
      contracts: 6,
    });
  });
  it("結合セルで空の媒体名は、前の行の媒体として読む", () => {
    expect(r.rows[1]).toMatchObject({
      outlet: "zexy_magazine",
      menu: "タイアップ",
      cost_yen: 200_000,
    });
  });
  it("区分の分からない媒体は null のまま残す", () => {
    expect(r.rows[3]).toMatchObject({ outlet: null, outlet_text: "ゼクシィ" });
  });
  it("見出しがなければ読めなかったことを返す（AI で読む）", () => {
    expect(
      parseTable(
        [
          ["9月", "10月"],
          ["800000", "600000"],
        ],
        null,
      ).headerFound,
    ).toBe(false);
  });
  it("エリア平均と昨年の列", () => {
    const t = parseTable(
      [
        ["年月", "媒体", "来館数", "昨年来館数", "エリア平均来館数", "エリア平均成約数", "エリア"],
        ["2026/09", "ゼクシィNET", "30", "25", "20.5", "5", "横浜"],
      ],
      null,
    );
    expect(t.rows).toEqual([
      expect.objectContaining({
        kind: "result",
        outlet: "zexy_net",
        visits: 30,
        last_visits: 25,
        month: "2026-09",
      }),
      expect.objectContaining({
        kind: "area",
        outlet: "zexy_net",
        area_avg_visits: 20.5,
        area_avg_contracts: 5,
        area: "横浜",
      }),
    ]);
  });
});

describe("来館メイン顧客と TOP 広告の合致", () => {
  const visitors = [
    ...Array.from({ length: 6 }, () => ({
      cluster_code: "C1",
      age_band: "25-29",
      area_band: "横浜",
      insightLabels: ["料理の美味しさ", "ゲストへのおもてなし"],
    })),
    ...Array.from({ length: 4 }, () => ({
      cluster_code: "C2",
      age_band: "30-34",
      area_band: "川崎",
      insightLabels: ["チャペルの雰囲気"],
    })),
  ];
  const c = mainCustomer(visitors);

  it("重視点を訴求軸にして数える（1人1回）", () => {
    expect(c.n).toBe(10);
    expect(c.axes.map((a) => [a.key, a.n])).toEqual([
      ["cuisine", 6],
      ["hospitality", 6],
      ["chapel", 4],
    ]);
    expect(c.clusters[0]).toMatchObject({ key: "C1", share: 0.6 });
  });

  it("キャッチから訴求軸を読む", () => {
    expect(axesFromText("シェフこだわりの試食フェア")).toEqual(["cuisine"]);
    expect(axesFromText("光あふれるチャペルで")).toEqual(["chapel"]);
  });

  it("いちばん重視される訴求があれば合致、上位3つなら一部合致、なければ不一致", () => {
    expect(matchLevel(c, ["cuisine"], 10)).toBe("match");
    expect(matchLevel(c, ["chapel", "price"], 10)).toBe("partial");
    expect(matchLevel(c, ["price"], 10)).toBe("mismatch");
    expect(matchLevel(c, [], 10)).toBe("no_ad");
    expect(matchLevel(c, ["cuisine"], 11)).toBe("insufficient");
  });
});

describe("メディアの評価", () => {
  const row = (p: Partial<ResultRow> & Pick<ResultRow, "month" | "outlet">): ResultRow => ({
    menu: "",
    cost_yen: null,
    visits: null,
    contracts: null,
    target_visits: null,
    ...p,
  });
  const results: ResultRow[] = [
    row({
      month: "2026-09-01",
      outlet: "zexy_magazine",
      cost_yen: 1_000_000,
      visits: 25,
      contracts: 8,
      target_visits: 20,
    }),
    row({
      month: "2026-09-01",
      outlet: "hanayume",
      cost_yen: 600_000,
      visits: 10,
      contracts: 2,
      target_visits: 15,
    }),
    row({ month: "2026-09-01", outlet: "official", cost_yen: 0, visits: 5, contracts: 2 }),
    row({
      month: "2025-09-01",
      outlet: "zexy_magazine",
      cost_yen: 1_000_000,
      visits: 20,
      contracts: 6,
    }),
    row({ month: "2025-09-01", outlet: "hanayume", cost_yen: 500_000, visits: 14, contracts: 3 }),
  ];
  const areas = [
    {
      month: "2026-09-01",
      area: "横浜",
      outlet: "zexy_magazine",
      avg_visits: 20,
      avg_contracts: 5,
    },
    {
      month: "2025-09-01",
      area: "横浜",
      outlet: "zexy_magazine",
      avg_visits: 20,
      avg_contracts: 5,
    },
  ];
  const e = evaluateMedia({
    results,
    areas,
    months: ["2026-09-01"],
    matches: {
      zexy_magazine: { visual: "match", catch: "partial" },
      hanayume: { visual: "mismatch", catch: "mismatch" },
    },
  });
  const z = e.rows.find((r) => r.outlet === "zexy_magazine")!;
  const h = e.rows.find((r) => r.outlet === "hanayume")!;

  it("1年前の同じ月", () => expect(lastYearMonth("2026-09-01")).toBe("2025-09-01"));

  it("目標比・昨年比・来館単価・成約単価", () => {
    expect(z).toMatchObject({
      targetRate: 1.25,
      lastYearRate: 1.25,
      visitCost: 40_000,
      contractCost: 125_000,
      lastVisitCost: 50_000,
    });
    expect(z.judges.target.tone).toBe("good");
    expect(h.judges.target).toEqual({ tone: "bad", label: "要改善" }); // 10/15 = 67%
    expect(h.judges.lastYear.tone).toBe("bad"); // 10/14 = 71%
  });

  it("単価は全媒体の平均と比べる（平均来館単価 1,600,000 ÷ 40 = 40,000）", () => {
    expect(e.avgVisitCost).toBe(40_000);
    expect(z.judges.visitCost.tone).toBe("good");
    expect(h.judges.visitCost.tone).toBe("bad"); // 60,000 は平均の1.5倍
  });

  it("エリア平均比は昨年の割合と比べる（125% ← 100%）", () => {
    expect(z.areaVisitShare).toBe(1.25);
    expect(z.lastAreaVisitShare).toBe(1);
    expect(z.judges.areaVisit).toEqual({ tone: "good", label: "上昇" });
    expect(h.areaVisitShare).toBeNull(); // その媒体のエリア平均がなければ算出不可
  });

  it("総合：要改善が3つ以上で見直し候補。来館が少ない媒体は保留", () => {
    expect(z.overall.label).toBe("良好");
    expect(h.overall.label).toBe("見直し候補");
    expect(e.rows.find((r) => r.outlet === "official")!.overall.label).toBe("保留（小標本）");
    expect(e.total).toMatchObject({ cost: 1_600_000, visits: 40, contracts: 12, lastVisits: 34 });
  });
});
