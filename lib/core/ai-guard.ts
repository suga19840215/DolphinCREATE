// AI へ送る前の検査（本番設計 受入テスト10・CLAUDE.md 7章）。
// 送る内容に、他施設のデータや個人情報（メール・電話番号）が混ざっていないかを確かめる。
// 1件でも見つかれば送らない。送った内容は記録し（M4 の ai_run_log）、同じ検査で後から確かめられるようにする。

export type AiGuardIssue =
  | { kind: "other_facility"; value: string }
  | { kind: "email" | "phone"; value: string }
  | { kind: "facility_mismatch"; value: string };

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 日本の電話番号（ハイフンあり・なし）。伏せ字済み（［電話］）は対象外
const PHONE = /(?<!\d)0\d{1,4}-?\d{1,4}-?\d{3,4}(?!\d)/g;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      strings(v, out);
    }
  }
  return out;
}

export function checkAiPayload(
  payload: { facility_id: string } & Record<string, unknown>,
  opts: { facilityId: string; otherFacilityKeys: readonly string[] },
): AiGuardIssue[] {
  const issues: AiGuardIssue[] = [];
  if (payload.facility_id !== opts.facilityId) {
    issues.push({ kind: "facility_mismatch", value: String(payload.facility_id) });
  }
  for (const s of strings(payload)) {
    for (const key of opts.otherFacilityKeys) {
      if (key && s.includes(key)) issues.push({ kind: "other_facility", value: key });
    }
    for (const m of s.match(EMAIL) ?? []) issues.push({ kind: "email", value: m });
    for (const m of s.match(PHONE) ?? []) issues.push({ kind: "phone", value: m });
  }
  return issues;
}
