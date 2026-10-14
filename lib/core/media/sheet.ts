// ⑥ アップロードした資料（表）を、媒体×月の行（下書き）にする。
// 見出しの言葉から列を当てはめる。見出しが見つからない・横に月が並ぶ表などは AI で読み取る（lib/server/media/read.ts）。
import { z } from "zod";
import { matchOutlet, MEDIA_OUTLETS, normalizeName } from "./outlets";

const OUTLET_CODES = MEDIA_OUTLETS.map((o) => o.code) as [string, ...string[]];

/** 下書きの1行。結果（媒体×月）とエリア平均の2種類 */
export const DraftRowSchema = z.object({
  kind: z.enum(["result", "area"]),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .nullable(), // 分からなければ null（確認画面で選ぶ）
  outlet: z.enum(OUTLET_CODES).nullable(), // 当てはまらなければ null（確認画面で選ぶ）
  outlet_text: z.string().max(100), // 資料に書かれていた媒体名
  menu: z.string().max(100),
  cost_yen: z.number().int().nonnegative().nullable(),
  visits: z.number().int().nonnegative().nullable(),
  contracts: z.number().int().nonnegative().nullable(),
  target_visits: z.number().int().nonnegative().nullable(),
  last_visits: z.number().int().nonnegative().nullable(),
  last_contracts: z.number().int().nonnegative().nullable(),
  area: z.string().max(50),
  area_avg_visits: z.number().nonnegative().nullable(),
  area_avg_contracts: z.number().nonnegative().nullable(),
});
export type DraftRow = z.infer<typeof DraftRowSchema>;

export const emptyDraft = (p: Partial<DraftRow> = {}): DraftRow => ({
  kind: "result",
  month: null,
  outlet: null,
  outlet_text: "",
  menu: "",
  cost_yen: null,
  visits: null,
  contracts: null,
  target_visits: null,
  last_visits: null,
  last_contracts: null,
  area: "",
  area_avg_visits: null,
  area_avg_contracts: null,
  ...p,
});

type Field =
  | "outlet"
  | "menu"
  | "month"
  | "cost_yen"
  | "visits"
  | "contracts"
  | "target_visits"
  | "last_visits"
  | "last_contracts"
  | "area"
  | "area_avg_visits"
  | "area_avg_contracts";

// 見出しの言葉（先に書いたものほど優先。「昨年来館」を「来館」より先に判定する）
const HEADERS: [Field, RegExp][] = [
  ["area_avg_visits", /エリア.*平均.*来館|平均来館/],
  ["area_avg_contracts", /エリア.*平均.*成約|平均成約/],
  ["last_visits", /(昨年|前年|去年).*来館/],
  ["last_contracts", /(昨年|前年|去年).*成約/],
  ["target_visits", /目標/],
  ["visits", /来館/],
  ["contracts", /成約|契約数/],
  ["cost_yen", /金額|掲載費|媒体費|費用|料金|出稿|予算|価格/],
  ["outlet", /媒体|メディア|掲載先|サイト名/],
  ["menu", /メニュー|プラン|商品|枠|掲載内容|オプション/],
  ["month", /^(年月|月|掲載月|対象月|期間|掲載期間|掲載開始)/],
  ["area", /^エリア$|^地域$/],
];

/** 「¥1,200,000」「120万円」「12件」「1.2万」を数にする。読めなければ null */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.normalize("NFKC").replace(/[,\s¥￥円件組名人]/g, "");
  if (!s || s === "-" || s === "ー" || s === "―") return null;
  let mul = 1;
  if (s.endsWith("万")) {
    mul = 10_000;
    s = s.slice(0, -1);
  } else if (s.endsWith("千")) {
    mul = 1_000;
    s = s.slice(0, -1);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s) * mul;
}

const int = (v: unknown) => {
  const n = parseNumber(v);
  return n === null || n < 0 ? null : Math.floor(n);
};

/** 「2026年9月」「2026/09」「2026-09-01」「R8.9」などから YYYY-MM。読めなければ null */
export function parseMonth(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel の日付は日本時間の 0 時を UTC で持つことがあるので、9時間足して日本の日付にする
    const d = new Date(v.getTime() + 9 * 3_600_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof v !== "string") return null;
  const s = v.normalize("NFKC");
  let m = s.match(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})/);
  if (m) {
    const mm = Number(m[2]);
    if (mm >= 1 && mm <= 12) return `${m[1]}-${String(mm).padStart(2, "0")}`;
  }
  m = s.match(/R\s*(\d{1,2})\s*[年/.\-]\s*(\d{1,2})|令和\s*(\d{1,2})\s*年\s*(\d{1,2})/);
  if (m) {
    const y = 2018 + Number(m[1] ?? m[3]);
    const mm = Number(m[2] ?? m[4]);
    if (mm >= 1 && mm <= 12) return `${y}-${String(mm).padStart(2, "0")}`;
  }
  return null;
}

const text = (v: unknown) => (v instanceof Date ? "" : String(v ?? "").trim());
const isTotalRow = (s: string) => /^(合計|小計|総計|計|total)$/i.test(normalizeName(s));

export type TableResult = { rows: DraftRow[]; headerFound: boolean };

/**
 * 表（行×列）を下書きにする。見出し行は先頭20行から探す（媒体名の列と、数値の列が1つ以上あること）。
 * fallbackMonth はシート名・ファイル名から読めた月（行に月の列がないときに使う）。
 */
export function parseTable(
  grid: readonly (readonly unknown[])[],
  fallbackMonth: string | null,
): TableResult {
  for (let h = 0; h < Math.min(grid.length, 20); h++) {
    const cols = new Map<Field, number>();
    grid[h]!.forEach((cell, i) => {
      const t = text(cell).normalize("NFKC").replace(/\s/g, "");
      // 単価・率・比は資料側で計算した列なので読まない（こちらで計算し直す）
      if (!t || /単価|率|比|%|％/.test(t)) return;
      const hit = HEADERS.find(([, re]) => re.test(t));
      if (hit && !cols.has(hit[0])) cols.set(hit[0], i);
    });
    const numeric = [
      "cost_yen",
      "visits",
      "contracts",
      "target_visits",
      "area_avg_visits",
      "area_avg_contracts",
    ] as const;
    if (!cols.has("outlet") || !numeric.some((f) => cols.has(f))) continue;

    const at = (row: readonly unknown[], f: Field) => (cols.has(f) ? row[cols.get(f)!] : undefined);
    const rows: DraftRow[] = [];
    let lastOutletText = "";
    for (const row of grid.slice(h + 1)) {
      // 結合セル（媒体名が先頭行にだけある）を考えて、空なら前の行の媒体名を使う
      const outletRaw = text(at(row, "outlet"));
      const outletText = outletRaw || (text(at(row, "menu")) ? lastOutletText : "");
      if (!outletText || isTotalRow(outletText) || isTotalRow(text(at(row, "menu")))) continue;
      if (outletRaw) lastOutletText = outletRaw;
      const values = {
        cost_yen: int(at(row, "cost_yen")),
        visits: int(at(row, "visits")),
        contracts: int(at(row, "contracts")),
        target_visits: int(at(row, "target_visits")),
        last_visits: int(at(row, "last_visits")),
        last_contracts: int(at(row, "last_contracts")),
        area_avg_visits: parseNumber(at(row, "area_avg_visits")),
        area_avg_contracts: parseNumber(at(row, "area_avg_contracts")),
      };
      if (Object.values(values).every((v) => v === null)) continue;
      const month = parseMonth(at(row, "month")) ?? fallbackMonth;
      const common = {
        month,
        outlet: matchOutlet(outletText),
        outlet_text: outletText.slice(0, 100),
        menu: text(at(row, "menu")).slice(0, 100),
        area: text(at(row, "area")).slice(0, 50),
      };
      const hasResult = [
        values.cost_yen,
        values.visits,
        values.contracts,
        values.target_visits,
        values.last_visits,
        values.last_contracts,
      ].some((v) => v !== null);
      if (hasResult)
        rows.push(
          emptyDraft({ ...common, ...values, area_avg_visits: null, area_avg_contracts: null }),
        );
      if (values.area_avg_visits !== null || values.area_avg_contracts !== null) {
        rows.push(
          emptyDraft({
            ...common,
            kind: "area",
            menu: "",
            area_avg_visits: values.area_avg_visits,
            area_avg_contracts: values.area_avg_contracts,
          }),
        );
      }
    }
    return { rows, headerFound: true };
  }
  return { rows: [], headerFound: false };
}
