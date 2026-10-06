// 計測紐付け率（仕様書7章）＝ 広告起点と判定できた予約 ÷ 全予約。試作版 linkRate と同じ考え方。
//   全予約 ＝ lead_id で広告と結べた予約 ＋ GA4 で予約完了だが CRM と結べなかった件数 ＋ 広告以外・判定不能の予約
import { ratio } from "./format";

export type LinkageInput = {
  /** CRM の予約のうち、広告ID（utm_content）を受け取れたもの */
  linkedReservations: number;
  /** CRM の予約のうち、広告以外・判定不能（電話・外部予約サイト・UTM欠損） */
  otherReservations: number;
  /** GA4 の予約完了（generate_lead）の合計 */
  ga4GenerateLead: number;
};

export function linkage(input: LinkageInput) {
  const unjoined = Math.max(0, input.ga4GenerateLead - input.linkedReservations);
  const total = input.linkedReservations + unjoined + input.otherReservations;
  return {
    linked: input.linkedReservations,
    unjoined,
    other: input.otherReservations,
    total,
    rate: ratio(input.linkedReservations, total),
  };
}
