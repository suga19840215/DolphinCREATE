import "server-only";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { z } from "zod";
import { toCsv } from "@/lib/core/csv";
import { decodeText, parseCsv } from "@/lib/core/import/csv";
import { maskContacts } from "@/lib/core/import/mask";
import { isOutlet, matchOutlet } from "@/lib/core/media/outlets";
import { emptyDraft, parseMonth, parseTable, type DraftRow } from "@/lib/core/media/sheet";
import { runAi } from "../ai/client";

// ⑥ アップロードした資料を下書きの行にする。
// Excel・CSV・Word の表は、見出しから列を当てはめて読む（AI を使わない）。読めない表と PDF は AI で読む。

export const MEDIA_DOC_TYPES = {
  xlsx: "Excel（.xlsx）",
  csv: "CSV",
  docx: "Word（.docx）",
  pdf: "PDF",
} as const;
export const MEDIA_DOC_MAX_BYTES = 4 * 1024 * 1024;

export type ReadResult =
  | { ok: true; method: "table" | "ai"; rows: DraftRow[]; message: string }
  | { ok: false; error: string };

type Grid = unknown[][];

/** Excel のセルの値を、表の読み取りで扱える形（文字・数・日付）にする */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean")
    return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return "";
}

async function excelGrids(bytes: Uint8Array): Promise<{ name: string; grid: Grid }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      grid[n - 1] = values.map((v) => cellValue(v as ExcelJS.CellValue));
    });
    return { name: ws.name, grid: Array.from(grid, (r) => r ?? []) };
  });
}

const xmlText = (xml: string) =>
  [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map((m) => m[1]!)
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

/** Word（.docx）の表と本文 */
async function wordContent(bytes: Uint8Array): Promise<{ tables: Grid[]; text: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((t) =>
    [...t[1]!.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) =>
      [...r[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => xmlText(c[1]!)),
    ),
  );
  const text = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
    .map((p) => xmlText(p[0]))
    .filter(Boolean)
    .join("\n");
  return { tables, text };
}

/** AI に渡す表の文字（連絡先は伏せ字にし、大きすぎる表は切らずに断る） */
function gridText(name: string, grid: Grid): string {
  const rows = grid
    .filter((r) => r.some((c) => String(c ?? "").trim()))
    .map((r) =>
      r.map((c) =>
        c instanceof Date ? c.toISOString().slice(0, 10) : maskContacts(String(c ?? "")),
      ),
    );
  return `## ${name}\n${toCsv(rows)}`;
}
const AI_TEXT_LIMIT = 200_000;

// AI の応答の形（制約は緩くし、受け取ってから DraftRow の決まりで確かめる）
const AiRow = z.object({
  kind: z.enum(["result", "area"]),
  month: z.string().nullable(),
  outlet: z.string().nullable(),
  outlet_text: z.string(),
  menu: z.string(),
  cost_yen: z.number().nullable(),
  visits: z.number().nullable(),
  contracts: z.number().nullable(),
  target_visits: z.number().nullable(),
  last_visits: z.number().nullable(),
  last_contracts: z.number().nullable(),
  area: z.string(),
  area_avg_visits: z.number().nullable(),
  area_avg_contracts: z.number().nullable(),
});
export const AiSheetSchema = z.object({ rows: z.array(AiRow), notes: z.array(z.string()) });

const cnt = (v: number | null) =>
  v === null || !Number.isFinite(v) || v < 0 ? null : Math.floor(v);
const avg = (v: number | null) =>
  v === null || !Number.isFinite(v) || v < 0 ? null : Math.round(v * 100) / 100;

/** AI が返した行を、保存できる形にそろえる（決まりに合わない値は空にする） */
export function normalizeAiRows(rows: z.infer<typeof AiRow>[]): DraftRow[] {
  return rows
    .map((r) =>
      emptyDraft({
        kind: r.kind,
        month:
          r.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) ? r.month : parseMonth(r.month ?? ""),
        outlet: isOutlet(r.outlet) ? r.outlet : matchOutlet(r.outlet_text),
        outlet_text: r.outlet_text.slice(0, 100),
        menu: r.menu.slice(0, 100),
        cost_yen: cnt(r.cost_yen),
        visits: cnt(r.visits),
        contracts: cnt(r.contracts),
        target_visits: cnt(r.target_visits),
        last_visits: cnt(r.last_visits),
        last_contracts: cnt(r.last_contracts),
        area: r.area.slice(0, 50),
        area_avg_visits: r.kind === "area" ? avg(r.area_avg_visits) : null,
        area_avg_contracts: r.kind === "area" ? avg(r.area_avg_contracts) : null,
      }),
    )
    .filter((r) =>
      [
        r.cost_yen,
        r.visits,
        r.contracts,
        r.target_visits,
        r.last_visits,
        r.last_contracts,
        r.area_avg_visits,
        r.area_avg_contracts,
      ].some((v) => v !== null),
    );
}

export function docKind(fileName: string): keyof typeof MEDIA_DOC_TYPES | "old" | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "csv" || ext === "docx" || ext === "pdf") return ext;
  if (ext === "xls" || ext === "doc") return "old";
  return null;
}

export async function readMediaDocument(opts: {
  facilityId: string;
  docId: string;
  fileName: string;
  sha256: string;
  bytes: Uint8Array;
  runBy: string;
}): Promise<ReadResult> {
  const kind = docKind(opts.fileName);
  if (kind === "old")
    return {
      ok: false,
      error: "古い形式（.xls／.doc）は読めません。.xlsx／.docx で保存し直してください。",
    };
  if (!kind)
    return { ok: false, error: "Excel（.xlsx）・CSV・Word（.docx）・PDF を選んでください。" };
  const fileMonth = parseMonth(opts.fileName);

  // 1) 表として読む
  let sources: { name: string; grid: Grid }[] = [];
  let wordText = "";
  try {
    if (kind === "xlsx") sources = await excelGrids(opts.bytes);
    if (kind === "csv")
      sources = [{ name: opts.fileName, grid: parseCsv(decodeText(opts.bytes).text) }];
    if (kind === "docx") {
      const w = await wordContent(opts.bytes);
      sources = w.tables.map((grid, i) => ({ name: `表${i + 1}`, grid }));
      wordText = w.text;
    }
  } catch {
    return {
      ok: false,
      error:
        "ファイルを開けませんでした。壊れていないか、パスワードが付いていないかを確かめてください。",
    };
  }
  const tableRows = sources.flatMap(
    (s) => parseTable(s.grid, parseMonth(s.name) ?? fileMonth).rows,
  );
  if (tableRows.length) {
    return {
      ok: true,
      method: "table",
      rows: tableRows,
      message: `表から${tableRows.length}行を読み取りました。`,
    };
  }

  // 2) AI で読む（PDF・見出しの見つからない表・文章）
  const logInput = { doc_id: opts.docId, file_name: opts.fileName, file_sha256: opts.sha256, kind };
  let content: Parameters<typeof runAi>[0]["content"];
  if (kind === "pdf") {
    content = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(opts.bytes).toString("base64"),
        },
      },
      { type: "text", text: `ファイル名：${opts.fileName}\nこの資料を読み取ってください。` },
    ];
  } else {
    const text = [
      ...sources.map((s) => gridText(s.name, s.grid)),
      wordText ? `## 本文\n${maskContacts(wordText)}` : "",
    ].join("\n\n");
    if (!text.trim()) return { ok: false, error: "資料に読み取れる内容がありませんでした。" };
    if (text.length > AI_TEXT_LIMIT)
      return {
        ok: false,
        error: "資料が大きすぎます。必要なシート・ページだけにして入れ直してください。",
      };
    content = [{ type: "text", text: `ファイル名：${opts.fileName}\n\n${text}` }];
  }
  const ai = await runAi({
    facilityId: opts.facilityId,
    purpose: "M1 媒体資料の読み取り",
    promptFile: "m1-media-sheet.md",
    content,
    logInput,
    schema: AiSheetSchema,
    runBy: opts.runBy,
  });
  if (!ai.ok) return { ok: false, error: ai.error };
  const rows = normalizeAiRows(ai.data.rows).map((r) => ({ ...r, month: r.month ?? fileMonth }));
  if (!rows.length) return { ok: false, error: "資料から媒体・金額・件数を読み取れませんでした。" };
  const notes = ai.data.notes.length
    ? `（AI のメモ：${ai.data.notes.slice(0, 3).join("／").slice(0, 200)}）`
    : "";
  return {
    ok: true,
    method: "ai",
    rows,
    message: `AI が${rows.length}行を読み取りました。内容を確かめてから確定してください。${notes}`,
  };
}
