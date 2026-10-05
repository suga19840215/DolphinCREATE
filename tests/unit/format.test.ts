import { describe, expect, it } from "vitest";
import {
  NOT_COMPUTABLE,
  formatCount,
  formatPercent,
  formatYen,
  formatYenNumber,
  ratio,
  withFee,
} from "@/lib/core/format";

describe("ratio", () => {
  it("分母が正なら割り算", () => expect(ratio(3, 4)).toBe(0.75));
  it("分母が0なら null（算出不可）", () => expect(ratio(5, 0)).toBeNull());
  it("分子が0でも分母が正なら0", () => expect(ratio(0, 10)).toBe(0));
});

describe("表示", () => {
  it("金額は円未満切り捨て", () => {
    expect(formatYen(1234.99)).toBe("1,234円");
    expect(formatYenNumber(999.9)).toBe("999");
  });
  it("分母0の単価は「算出不可」で、0や空欄にしない", () => {
    expect(formatYen(ratio(50_000, 0))).toBe(NOT_COMPUTABLE);
    expect(formatPercent(ratio(0, 0))).toBe(NOT_COMPUTABLE);
  });
  it("割合は小数1桁が既定", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(0.1234, 2)).toBe("12.34%");
  });
  it("件数は桁区切り、値なしは「—」", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatCount(null)).toBe("—");
  });
});

describe("withFee", () => {
  it("Fee率20%：使用額×1.2", () => expect(withFee(100_000, 2000)).toBe(120_000));
  it("円未満は切り捨て", () => expect(withFee(333, 2000)).toBe(399));
  it("Fee率0%なら変わらない", () => expect(withFee(12_345, 0)).toBe(12_345));
  it("整数以外は受け付けない", () => expect(() => withFee(1.5, 2000)).toThrow());
});
