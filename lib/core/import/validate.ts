// 取込前の検証。接客データは試作版（validateImport）と同じ順で判定する：
//   ①必須項目の欠け → ②他施設のデータ → ③重複（ファイル内・登録済み）→ ④広告改善の同意なし
import { FIELDS, type ImportKind } from "./fields";
import { isPiiHeader, maskContacts } from "./mask";

export type ImportPreview = {
  kind: ImportKind;
  total: number;
  ok: number[]; // 取り込む行の番号（0始まり、見出しを除く）
  missing: number[];
  wrongFacility: number[];
  duplicate: number[];
  noConsent: number[];
  invalid: { row: number; reason: string }[];
  updates: number[]; // 登録済みの行を新しい内容で更新するもの（CRM）
  piiColumns: string[];
  maskedRows: number;
};

export type ValidateContext = {
  /** この施設の ID（CSV の施設ID列と照合する。Dolphin 側の ID が違うときは対応表の値） */
  facilityKeys: readonly string[];
  /** すでに登録済みのキー（接客ID・lead_id・広告ID＋日付など） */
  existingKeys: ReadonlySet<string>;
};

const CONSENT = /^(1|true|yes|有|あり|同意)$/i;

export function cell(row: readonly string[], map: Record<string, number>, key: string): string {
  const i = map[key] ?? -1;
  return i >= 0 ? (row[i] ?? "").trim() : "";
}

/** 自然キー：同じものが2回来たら重複とみなす単位 */
export function naturalKey(
  kind: ImportKind,
  row: readonly string[],
  map: Record<string, number>,
): string {
  switch (kind) {
    case "consultation":
      return cell(row, map, "consultation_id");
    case "crm":
      return cell(row, map, "lead_id");
    case "ads":
      return `${normalizeDate(cell(row, map, "date")) ?? ""}|${cell(row, map, "ad_id")}`;
    case "ga4":
      return `${normalizeDate(cell(row, map, "date")) ?? ""}|${cell(row, map, "ad_id")}|${cell(row, map, "landing_page")}`;
    case "images":
      return cell(row, map, "asset_id");
  }
}

/** 日付を YYYY-MM-DD に。読めなければ null。 */
export function normalizeDate(v: string): string | null {
  const m = v.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** 数値（カンマ・円・¥・% を外す）。空欄は 0、読めなければ null。 */
export function parseNumber(v: string): number | null {
  const s = v.replace(/[,，\s円¥￥]/g, "");
  if (s === "" || s === "--" || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validateImport(
  kind: ImportKind,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  map: Record<string, number>,
  ctx: ValidateContext,
): ImportPreview {
  const out: ImportPreview = {
    kind,
    total: rows.length,
    ok: [],
    missing: [],
    wrongFacility: [],
    duplicate: [],
    noConsent: [],
    invalid: [],
    updates: [],
    piiColumns: headers.filter((h) => isPiiHeader(h)),
    maskedRows: 0,
  };
  const required = FIELDS[kind].filter((fd) => fd.required).map((fd) => fd.key);
  const hasFacilityColumn = FIELDS[kind].some((fd) => fd.key === "facility_id");
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    if (required.some((k) => cell(row, map, k) === "")) return void out.missing.push(i);
    if (hasFacilityColumn && !ctx.facilityKeys.includes(cell(row, map, "facility_id"))) {
      return void out.wrongFacility.push(i);
    }
    const key = naturalKey(kind, row, map);
    if (seen.has(key)) return void out.duplicate.push(i);
    seen.add(key);

    if (kind === "consultation") {
      if (ctx.existingKeys.has(key)) return void out.duplicate.push(i);
      if (!CONSENT.test(cell(row, map, "consent_ad"))) return void out.noConsent.push(i);
    }
    if (kind === "ads" || kind === "ga4") {
      if (!normalizeDate(cell(row, map, "date"))) {
        return void out.invalid.push({ row: i, reason: "日付を読めません" });
      }
      const numbers =
        kind === "ads"
          ? ["impressions", "clicks", "cost", "conversions"]
          : [
              "lp_sessions",
              "view_fair",
              "select_fair",
              "form_start",
              "form_error",
              "generate_lead",
            ];
      const bad = numbers.find((k) => {
        const n = parseNumber(cell(row, map, k));
        return n === null || n < 0;
      });
      if (bad) return void out.invalid.push({ row: i, reason: `${bad} が数値ではありません` });
    }
    // CRM・広告実績・GA4 は、登録済みなら新しい内容で上書きする（状況が日々変わるため）
    if (kind !== "consultation" && ctx.existingKeys.has(key)) out.updates.push(i);
    out.ok.push(i);
  });

  // 発言内の連絡先を伏せ字にした行の数（試作版と同じく全行を数える）
  if (kind === "consultation") {
    const q = map.quote ?? -1;
    out.maskedRows =
      q >= 0 ? rows.filter((r) => maskContacts(r[q] ?? "") !== (r[q] ?? "")).length : 0;
  }
  return out;
}
