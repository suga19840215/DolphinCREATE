// 検証を通った行を、DB に入れる形にする。自由記述はすべて伏せ字にしてから渡す。
import type { ImportKind } from "./fields";
import { maskContacts } from "./mask";
import { cell, normalizeDate, parseNumber, type ImportPreview } from "./validate";

type Row = readonly string[];
type Map = Record<string, number>;

const text = (row: Row, map: Map, key: string, max = 500): string | null => {
  const v = maskContacts(cell(row, map, key)).slice(0, max);
  return v === "" ? null : v;
};

/** 日時を ISO 形式に。時刻帯の指定がなければ日本時間とみなす（保存は UTC）。 */
export function toIsoDateTime(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", se = "0", tz] = m;
  const pad = (x: string) => x.padStart(2, "0");
  const zone = tz
    ? tz === "Z"
      ? "Z"
      : tz.includes(":")
        ? tz
        : `${tz.slice(0, 3)}:${tz.slice(3)}`
    : "+09:00";
  const t = new Date(`${y}-${pad(mo!)}-${pad(d!)}T${pad(h)}:${pad(mi)}:${pad(se)}${zone}`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export type Outcome = "contracted" | "not_contracted" | "pending";

export function parseOutcome(v: string): Outcome | null {
  const s = v.trim().toLowerCase();
  if (/^(1|true|成約|contracted|won)$/.test(s)) return "contracted";
  if (/^(0|false|非成約|失注|not_contracted|lost)$/.test(s)) return "not_contracted";
  if (/^(見積中|保留|検討中|pending)$/.test(s)) return "pending";
  return null;
}

export function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (/^(1|true|yes|有|あり|有効)$/.test(s)) return true;
  if (/^(0|false|no|無|なし|無効)$/.test(s)) return false;
  return null;
}

const int = (row: Row, map: Map, key: string): number =>
  Math.floor(parseNumber(cell(row, map, key)) ?? 0);
const yenOrNull = (row: Row, map: Map, key: string): number | null =>
  cell(row, map, key) === "" ? null : Math.floor(parseNumber(cell(row, map, key)) ?? 0);

export function normalizeRows(
  kind: Exclude<ImportKind, "images">,
  rows: readonly Row[],
  map: Map,
  preview: ImportPreview,
): Record<string, unknown>[] {
  return preview.ok.map((i) => {
    const row = rows[i]!;
    switch (kind) {
      case "consultation": {
        const speaker = cell(row, map, "speaker");
        return {
          external_id: cell(row, map, "consultation_id"),
          lead_id: cell(row, map, "lead_id"),
          consulted_at: toIsoDateTime(cell(row, map, "consult_date")),
          source: text(row, map, "source", 100),
          outcome: parseOutcome(cell(row, map, "contract")),
          staff_code: text(row, map, "staff_id", 50),
          age_band: text(row, map, "age_band", 50),
          area_band: text(row, map, "area", 100),
          cluster_code: text(row, map, "cluster", 100),
          visit_motive: text(row, map, "visit_motive", 200),
          decision_factor: text(row, map, "decision_factor", 200),
          noncontract_reason: text(row, map, "noncontract_reason", 200),
          competitor_name: text(row, map, "competitor", 200),
          priorities: cell(row, map, "priorities")
            .split(/[|｜;；、]/)
            .map((s) => maskContacts(s.trim()).slice(0, 200))
            .filter(Boolean),
          quote_masked: text(row, map, "quote", 2000),
          speaker: /担当|staff/i.test(speaker)
            ? "staff"
            : /本人|新郎|新婦|customer/i.test(speaker)
              ? "customer"
              : null,
        };
      }
      case "crm": {
        const utmContent = text(row, map, "utm_content", 200);
        return {
          lead_id: cell(row, map, "lead_id"),
          reserved_at: toIsoDateTime(cell(row, map, "reserved_at")),
          is_valid: parseBool(cell(row, map, "is_valid")),
          cancelled_at: toIsoDateTime(cell(row, map, "cancelled_at")),
          visited_at: toIsoDateTime(cell(row, map, "visited_at")),
          outcome: parseOutcome(cell(row, map, "outcome")),
          contracted_at: toIsoDateTime(cell(row, map, "contracted_at")),
          lost_reason: text(row, map, "lost_reason", 200),
          revenue_yen: yenOrNull(row, map, "revenue"),
          gross_profit_yen: yenOrNull(row, map, "gross_profit"),
          channel: text(row, map, "channel", 100),
          utm_source: text(row, map, "utm_source", 200),
          utm_medium: text(row, map, "utm_medium", 200),
          utm_campaign: text(row, map, "utm_campaign", 200),
          utm_content: utmContent,
          utm_term: text(row, map, "utm_term", 200),
          click_id: text(row, map, "click_id", 300),
          ga4_client_id: text(row, map, "ga4_client_id", 100),
          // 広告起点と判定できるのは、広告ID（utm_content）を受け取れた予約だけ。推測で割り振らない
          ad_id: utmContent,
        };
      }
      case "ads":
        return {
          date: normalizeDate(cell(row, map, "date")),
          campaign: text(row, map, "campaign", 300),
          ad_group: text(row, map, "ad_group", 300),
          ad_id: cell(row, map, "ad_id"),
          ad_name: text(row, map, "ad_name", 300),
          asset_code: text(row, map, "asset_id", 100),
          impressions: int(row, map, "impressions"),
          clicks: int(row, map, "clicks"),
          cost_yen: int(row, map, "cost"),
          media_reported_cv: parseNumber(cell(row, map, "conversions")) ?? 0,
        };
      case "ga4":
        return {
          date: normalizeDate(cell(row, map, "date")),
          ad_id: cell(row, map, "ad_id"),
          landing_page: cell(row, map, "landing_page"),
          lp_sessions: int(row, map, "lp_sessions"),
          view_fair: int(row, map, "view_fair"),
          select_fair: int(row, map, "select_fair"),
          form_start: int(row, map, "form_start"),
          form_error: int(row, map, "form_error"),
          generate_lead: int(row, map, "generate_lead"),
        };
    }
  });
}
