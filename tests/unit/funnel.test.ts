import { describe, expect, it } from "vitest";
import {
  diagnose,
  emptyFunnel,
  recommend,
  stageRates,
  sumFunnels,
  type AdFunnel,
} from "@/lib/core/funnel";

const f = (p: Partial<AdFunnel>): AdFunnel => ({ ...emptyFunnel(), ...p });
const base = f({
  impressions: 100000,
  clicks: 2000,
  cost: 300000,
  lp: 1700,
  cta: 340,
  formStart: 120,
  lead: 40,
  res: 36,
  valid: 30,
  visit: 22,
  contract: 7,
  grossProfit: 7000000,
});

describe("段階別通過率（目安の80%未満で詰まり）", () => {
  it("前段階からの通過率と詰まり", () => {
    const s = stageRates(base);
    expect(s[0]).toMatchObject({ label: "広告クリック", rate: null, low: false });
    expect(s[1]!.rate).toBeCloseTo(0.85);
    expect(s[3]!.label).toBe("フォーム開始");
    expect(s[3]!.rate).toBeCloseTo(120 / 340);
    expect(s[3]!.low).toBe(false); // 0.353 >= 0.36*0.8
    const bad = stageRates({ ...base, formStart: 60 });
    expect(bad[3]!.low).toBe(true); // 0.176 < 0.288
  });
  it("分母0は算出不可（null）で、詰まりにもしない", () => {
    const s = stageRates(emptyFunnel());
    expect(s[1]).toMatchObject({ rate: null, low: false });
  });
});

describe("広告別の診断（試作版と同じ判定）", () => {
  const total = sumFunnels([base, base]);
  it("来館8件未満は保留", () =>
    expect(diagnose(f({ visit: 7 }), total).label).toBe("保留・小標本"));
  it("来館率が平均の80%未満 → 予約高・来館低", () =>
    expect(diagnose({ ...base, visit: 12 }, total).label).toBe("予約高・来館低"));
  it("CTR高・予約低", () =>
    expect(diagnose({ ...base, clicks: 4000, lp: 3400, lead: 40 }, total).label).toBe(
      "CTR高・予約低",
    ));
  it("来館高・成約低", () =>
    expect(diagnose({ ...base, contract: 3 }, total).label).toBe("来館高・成約低"));
  it("粗利低", () =>
    expect(diagnose({ ...base, grossProfit: 2000000 }, total).label).toBe("粗利低"));
  it("目立つ詰まりなし", () => expect(diagnose(base, total).label).toBe("目立つ詰まりなし"));
});

describe("継続／修正／停止候補／保留", () => {
  it("来館8件未満は保留", () => expect(recommend(f({ visit: 5 }), 40000).label).toBe("保留"));
  it("成約0件は停止候補", () =>
    expect(recommend(f({ visit: 10, valid: 12 }), 40000).label).toBe("停止候補"));
  it("来館率60%未満は修正", () =>
    expect(recommend(f({ visit: 10, valid: 20, contract: 2, cost: 10000 }), 40000)).toMatchObject({
      label: "修正",
      note: "来館率が低い",
    }));
  it("成約単価が平均の85%以下は継続", () =>
    expect(recommend(f({ visit: 10, valid: 12, contract: 2, cost: 60000 }), 40000).label).toBe(
      "継続",
    ));
  it("130%超は修正", () =>
    expect(recommend(f({ visit: 10, valid: 12, contract: 1, cost: 60000 }), 40000)).toMatchObject({
      label: "修正",
      note: "成約単価が高い",
    }));
});
