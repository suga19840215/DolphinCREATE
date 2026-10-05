// 計算と表示の基本ルール（仕様書7章・CLAUDE.md 6章）。
// 画面・Excel・CSV のどこから使っても同じ結果になるよう、ここだけで定義する。

/** 分母が0以下のときに表示する文言。0や空欄にはしない。 */
export const NOT_COMPUTABLE = "算出不可";

/** 割り算。分母が0以下なら null（＝算出不可）。 */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

const isComputable = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && Number.isFinite(v);

/** 金額を円未満切り捨てで「1,234」の形にする（単位なし）。 */
export function formatYenNumber(v: number | null | undefined): string {
  return isComputable(v) ? Math.floor(v).toLocaleString("ja-JP") : NOT_COMPUTABLE;
}

/** 金額を円未満切り捨てで「1,234円」の形にする。 */
export function formatYen(v: number | null | undefined): string {
  return isComputable(v) ? `${formatYenNumber(v)}円` : NOT_COMPUTABLE;
}

/** 割合（0〜1）を「12.3%」の形にする。 */
export function formatPercent(v: number | null | undefined, digits = 1): string {
  return isComputable(v) ? `${(v * 100).toFixed(digits)}%` : NOT_COMPUTABLE;
}

/** 件数を「1,234」の形にする。値がないときは「—」。 */
export function formatCount(v: number | null | undefined): string {
  return isComputable(v) ? Math.round(v).toLocaleString("ja-JP") : "—";
}

/**
 * Fee込みの使用額（円未満切り捨て）。使用額 ×（1＋Fee率）。
 * Fee率は万分率の整数（2000 = 20%）で受け取り、小数の誤差を出さない。
 */
export function withFee(costYen: number, feeRateBasisPoints: number): number {
  if (!Number.isInteger(costYen) || !Number.isInteger(feeRateBasisPoints)) {
    throw new Error("使用額とFee率は整数で渡してください");
  }
  if (feeRateBasisPoints < 0) throw new Error("Fee率は0以上にしてください");
  return Math.floor((costYen * (10_000 + feeRateBasisPoints)) / 10_000);
}
