import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { decodeText, parseCsv } from "@/lib/core/import/csv";
import { FIELDS, autoMap, type ImportKind } from "@/lib/core/import/fields";
import { isPiiHeader, maskContacts } from "@/lib/core/import/mask";
import { normalizeRows } from "@/lib/core/import/normalize";
import { naturalKey, validateImport, type ImportPreview } from "@/lib/core/import/validate";
import type { Database } from "./database.types";
import { userClient } from "./supabase";

export type Media = Database["app"]["Enums"]["media"];
export const MEDIA_LABEL: Record<Media, string> = {
  google_search: "Google検索",
  demand_gen: "デマンドジェネレーション",
  meta: "Meta（Instagram）",
};

// 公開先（Vercel）の1回の送信の上限（約4.5MB）に合わせる
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export type TableKind = Exclude<ImportKind, "images">;

export type PreviewResult = {
  fileName: string;
  encoding: string;
  sha256: string;
  headers: string[];
  map: Record<string, number>;
  preview: ImportPreview;
  sampleRows: string[][]; // 先頭5行（個人情報の列は「除外」、発言は伏せ字）
  alreadyImported: boolean;
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function existingKeys(
  facilityId: string,
  kind: TableKind,
  media: Media | null,
  rows: readonly (readonly string[])[],
  map: Record<string, number>,
): Promise<Set<string>> {
  const supabase = await userClient();
  const keys = new Set<string>();
  const wanted = [
    ...new Set(rows.map((r) => naturalKey(kind, r, map)).filter((k) => k && !k.startsWith("|"))),
  ];
  for (let i = 0; i < wanted.length; i += 200) {
    const chunk = wanted.slice(i, i + 200);
    if (kind === "consultation") {
      const { data } = await supabase
        .from("consultation_session")
        .select("external_id")
        .eq("facility_id", facilityId)
        .in("external_id", chunk);
      for (const d of data ?? []) keys.add(d.external_id);
    } else if (kind === "crm") {
      const { data } = await supabase
        .from("crm_lead")
        .select("lead_id")
        .eq("facility_id", facilityId)
        .in("lead_id", chunk);
      for (const d of data ?? []) keys.add(d.lead_id);
    } else if (kind === "ads" && media) {
      const ads = [...new Set(chunk.map((k) => k.split("|")[1]!))];
      const { data } = await supabase
        .from("media_daily_metric")
        .select("date, ad_id")
        .eq("facility_id", facilityId)
        .eq("media", media)
        .in("ad_id", ads);
      for (const d of data ?? []) keys.add(`${d.date}|${d.ad_id}`);
    } else if (kind === "ga4") {
      const ads = [...new Set(chunk.map((k) => k.split("|")[1]!))];
      const { data } = await supabase
        .from("funnel_event")
        .select("date, ad_id, landing_page")
        .eq("facility_id", facilityId)
        .in("ad_id", ads);
      for (const d of data ?? []) keys.add(`${d.date}|${d.ad_id}|${d.landing_page}`);
    }
  }
  return keys;
}

async function alreadyImported(
  facilityId: string,
  kind: ImportKind | "market_report",
  hash: string,
) {
  const supabase = await userClient();
  const { data } = await supabase
    .from("import_job")
    .select("id")
    .eq("facility_id", facilityId)
    .eq("kind", kind)
    .eq("file_sha256", hash)
    .limit(1);
  return !!data?.length;
}

/** 表形式（CSV）の取込の下見。対応付けを変えたときも、ここを通して数え直す。 */
export async function previewTableImport(opts: {
  facility: { id: string; code: string };
  kind: TableKind;
  media: Media | null;
  fileName: string;
  bytes: Uint8Array;
  map?: Record<string, number>;
}): Promise<PreviewResult | { error: string }> {
  if (opts.bytes.byteLength > MAX_IMPORT_BYTES)
    return { error: "ファイルが大きすぎます（4MBまで）。分けて取り込んでください。" };
  if (opts.kind === "ads" && !opts.media) return { error: "媒体を選んでください。" };
  const { text, encoding } = decodeText(opts.bytes);
  const [headers, ...rows] = parseCsv(text);
  if (!headers || !rows.length) {
    return {
      error: "CSVにデータ行がありません。1行目に見出し、2行目以降にデータを入れてください。",
    };
  }
  const auto = autoMap(opts.kind, headers, isPiiHeader);
  // 画面で変えた対応付けは受け付けるが、個人情報の列と範囲外の番号は無視する
  const map: Record<string, number> = { ...auto };
  if (opts.map) {
    for (const field of FIELDS[opts.kind]) {
      const i = opts.map[field.key];
      if (typeof i !== "number") continue;
      map[field.key] = i >= 0 && i < headers.length && !isPiiHeader(headers[i]!) ? i : -1;
    }
  }
  const hash = sha256(opts.bytes);
  const preview = validateImport(opts.kind, headers, rows, map, {
    facilityKeys: [opts.facility.code],
    existingKeys: await existingKeys(opts.facility.id, opts.kind, opts.media, rows, map),
  });
  return {
    fileName: opts.fileName.slice(0, 300),
    encoding,
    sha256: hash,
    headers,
    map,
    preview,
    sampleRows: rows
      .slice(0, 5)
      .map((r) => headers.map((h, i) => (isPiiHeader(h) ? "（除外）" : maskContacts(r[i] ?? "")))),
    alreadyImported: await alreadyImported(opts.facility.id, opts.kind, hash),
  };
}

/** 取込の確定。数え直しはサーバーで行い、画面から送られた件数は使わない。 */
export async function commitTableImport(opts: Parameters<typeof previewTableImport>[0]) {
  const result = await previewTableImport(opts);
  if ("error" in result) return result;
  if (result.alreadyImported)
    return { error: "このファイルは取込済みです。同じ内容を二度取り込むことはできません。" };
  const { preview, map } = result;
  if (!preview.ok.length) return { error: "取り込める行がありません。" };

  const { text } = decodeText(opts.bytes);
  const [, ...rows] = parseCsv(text);
  const normalized = normalizeRows(opts.kind, rows, map, preview);

  const supabase = await userClient();
  const { data, error } = await supabase.rpc("commit_import", {
    job: {
      facility_id: opts.facility.id,
      kind: opts.kind,
      media: opts.kind === "ads" ? opts.media : null,
      file_name: result.fileName,
      file_sha256: result.sha256,
      encoding: result.encoding,
      mapping: Object.fromEntries(
        Object.entries(map).map(([k, i]) => [k, i >= 0 ? result.headers[i] : null]),
      ),
      rows_total: preview.total,
      rows_ok: preview.ok.length - preview.updates.length,
      rows_updated: preview.updates.length,
      rows_duplicate: preview.duplicate.length,
      rows_missing: preview.missing.length,
      rows_no_consent: preview.noConsent.length,
      rows_wrong_facility: preview.wrongFacility.length,
      rows_invalid: preview.invalid.length,
      pii_columns_dropped: preview.piiColumns,
      masked_count: preview.maskedRows,
    },
    rows: normalized as never,
  });
  if (error || !data) {
    return { error: "取り込めませんでした。権限と内容を確かめて、もう一度お試しください。" };
  }
  return { jobId: data, count: preview.ok.length, updated: preview.updates.length };
}

// ---- マーケットレポート（要件表「レスポンス項目案」の形の JSON） ----

const reportSchema = z.object({
  report_id: z.string().min(1).max(100),
  facility_id: z.string().min(1),
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  created_at: z.iso.datetime({ offset: true }),
  version: z.number().int().min(1),
  area: z.string().min(1).max(200),
  market_weddings: z.number().int().nonnegative().optional(),
  avg_guests: z.number().nonnegative().optional(),
  avg_spend_yen: z.number().int().nonnegative().optional(),
  price_bands: z.array(z.object({ band: z.string(), share: z.number().min(0).max(1) })).optional(),
  seasonal_demand: z.array(z.object({ month: z.string(), index: z.number() })).optional(),
  style_trends: z
    .array(
      z.object({
        style: z.string(),
        share: z.number().min(0).max(1),
        change: z.number().optional(),
      }),
    )
    .optional(),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        hp_url: z.string().optional(),
        instagram_url: z.string().optional(),
        price_band: z.string().optional(),
        appeal_themes: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  insights: z
    .array(
      z.object({
        text: z.string(),
        basis: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  sample_size: z.number().int().nonnegative(),
  source: z.string().min(1).max(300),
  notes: z.string().max(2000).optional(),
});

export async function commitMarketReport(opts: {
  facility: { id: string; code: string };
  fileName: string;
  bytes: Uint8Array;
}) {
  if (opts.bytes.byteLength > MAX_IMPORT_BYTES)
    return { error: "ファイルが大きすぎます（4MBまで）。分けて取り込んでください。" };
  let json: unknown;
  try {
    json = JSON.parse(decodeText(opts.bytes).text);
  } catch {
    return { error: "JSON として読めません。" };
  }
  const list = Array.isArray(json) ? json : [json];
  const parsed = z.array(reportSchema).safeParse(list);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.slice(1).join(".")))].join(
      "、",
    );
    return { error: `項目が足りないか、形が違います：${fields}` };
  }
  const ours = parsed.data.filter((r) => r.facility_id === opts.facility.code);
  const wrong = parsed.data.length - ours.length;
  if (!ours.length) return { error: "この施設のレポートが含まれていません。" };

  const hash = sha256(opts.bytes);
  if (await alreadyImported(opts.facility.id, "market_report", hash)) {
    return { error: "このファイルは取込済みです。" };
  }
  const supabase = await userClient();
  const { data: existing } = await supabase
    .from("market_report")
    .select("report_id, version")
    .eq("facility_id", opts.facility.id)
    .in(
      "report_id",
      ours.map((r) => r.report_id),
    );
  const have = new Set((existing ?? []).map((e) => `${e.report_id}|${e.version}`));
  const fresh = ours.filter((r) => !have.has(`${r.report_id}|${r.version}`));
  if (!fresh.length) return { error: "同じレポートの同じ版は取込済みです。" };

  const rows = fresh.map((r) => ({
    report_id: r.report_id,
    version: r.version,
    period_start: r.period_start,
    period_end: r.period_end,
    report_created_at: r.created_at,
    area: r.area,
    sample_size: r.sample_size,
    data_source: r.source,
    market_weddings: r.market_weddings ?? null,
    avg_guests: r.avg_guests ?? null,
    avg_spend_yen: r.avg_spend_yen ?? null,
    payload: {
      price_bands: r.price_bands ?? [],
      seasonal_demand: r.seasonal_demand ?? [],
      style_trends: r.style_trends ?? [],
      competitors: r.competitors ?? [],
      insights: (r.insights ?? []).map((x) => ({ ...x, text: maskContacts(x.text) })),
    },
    notes: r.notes ? maskContacts(r.notes) : null,
  }));
  const { data, error } = await supabase.rpc("commit_import", {
    job: {
      facility_id: opts.facility.id,
      kind: "market_report",
      file_name: opts.fileName.slice(0, 300),
      file_sha256: hash,
      encoding: "utf-8",
      rows_total: parsed.data.length,
      rows_ok: fresh.length,
      rows_updated: 0,
      rows_duplicate: ours.length - fresh.length,
      rows_missing: 0,
      rows_no_consent: 0,
      rows_wrong_facility: wrong,
      rows_invalid: 0,
      pii_columns_dropped: [],
      masked_count: 0,
    },
    rows: rows as never,
  });
  if (error || !data) return { error: "取り込めませんでした。権限と内容を確かめてください。" };
  return { jobId: data, count: fresh.length, updated: 0 };
}

// ---- Dolphin 生成画像（画像ファイル＋任意の情報CSV） ----

const IMAGE_TYPES: { ext: string; mime: string; magic: number[] }[] = [
  { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { ext: "webp", mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
];
const MAX_IMAGE_BYTES = MAX_IMPORT_BYTES;
const MAX_IMAGES = 50;

function imageType(bytes: Uint8Array) {
  return IMAGE_TYPES.find((t) => t.magic.every((b, i) => bytes[i] === b));
}

const safeCode = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 100);

export async function commitImageImport(opts: {
  facility: { id: string; code: string };
  images: { name: string; bytes: Uint8Array }[];
  info?: { name: string; bytes: Uint8Array };
}) {
  if (!opts.images.length) return { error: "画像ファイルを選んでください。" };
  if (opts.images.length > MAX_IMAGES)
    return { error: `一度に取り込める画像は${MAX_IMAGES}枚までです。` };
  const total =
    opts.images.reduce((a, i) => a + i.bytes.byteLength, 0) + (opts.info?.bytes.byteLength ?? 0);
  if (total > MAX_IMPORT_BYTES)
    return { error: "一度に送れるのは合計4MBまでです。数回に分けて取り込んでください。" };

  // 情報CSV（任意）：ファイル名ごとの画像ID・タイトル・生成指示・ターゲット・期限
  const infoByFile = new Map<string, Record<string, string>>();
  let infoRows = 0;
  let infoMissing = 0;
  let piiColumns: string[] = [];
  if (opts.info) {
    const [headers, ...rows] = parseCsv(decodeText(opts.info.bytes).text);
    if (!headers) return { error: "情報CSVに見出しがありません。" };
    piiColumns = headers.filter((h) => isPiiHeader(h));
    const map = autoMap("images", headers, isPiiHeader);
    infoRows = rows.length;
    for (const r of rows) {
      const get = (k: string) => (map[k]! >= 0 ? (r[map[k]!] ?? "").trim() : "");
      if (!get("file_name") || !get("asset_id")) {
        infoMissing++;
        continue;
      }
      infoByFile.set(get("file_name"), {
        asset_id: get("asset_id"),
        title: maskContacts(get("title")),
        prompt: maskContacts(get("prompt")),
        target: maskContacts(get("target")),
        expiry: get("expiry"),
      });
    }
  }

  const supabase = await userClient();
  const candidates = opts.images.map((img) => {
    const info = infoByFile.get(img.name);
    const code = safeCode(info?.asset_id ?? img.name.replace(/\.[^.]+$/, ""));
    return { img, info, code, type: imageType(img.bytes) };
  });
  const invalid = candidates.filter(
    (c) => !c.type || c.img.bytes.byteLength > MAX_IMAGE_BYTES || !c.code,
  );
  const valid = candidates.filter((c) => !invalid.includes(c));

  const { data: existing } = await supabase
    .from("asset")
    .select("code")
    .eq("facility_id", opts.facility.id)
    .in(
      "code",
      valid.map((c) => c.code),
    );
  const have = new Set((existing ?? []).map((e) => e.code));
  const seen = new Set<string>();
  const fresh = valid.filter((c) => {
    if (have.has(c.code) || seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });
  if (!fresh.length)
    return { error: "取り込める画像がありません（形式が違うか、同じ画像IDが登録済みです）。" };

  const hash = createHash("sha256");
  for (const c of fresh) hash.update(c.img.bytes);
  const uploaded: string[] = [];
  for (const c of fresh) {
    const path = `${opts.facility.id}/assets/dolphin/${c.code}.${c.type!.ext}`;
    const { error } = await supabase.storage
      .from("facility-files")
      .upload(path, c.img.bytes, { contentType: c.type!.mime, upsert: false });
    if (error) {
      if (uploaded.length) await supabase.storage.from("facility-files").remove(uploaded);
      return { error: "画像を保存できませんでした。権限を確かめてください。" };
    }
    uploaded.push(path);
  }

  const expires = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const { data, error } = await supabase.rpc("commit_import", {
    job: {
      facility_id: opts.facility.id,
      kind: "images",
      file_name: (opts.info?.name ?? `${fresh.length}枚の画像`).slice(0, 300),
      file_sha256: hash.digest("hex"),
      rows_total: opts.images.length,
      rows_ok: fresh.length,
      rows_updated: 0,
      rows_duplicate: valid.length - fresh.length,
      rows_missing: infoMissing,
      rows_no_consent: 0,
      rows_wrong_facility: 0,
      rows_invalid: invalid.length,
      pii_columns_dropped: piiColumns,
      masked_count: 0,
    },
    rows: fresh.map((c, i) => ({
      code: c.code,
      title: c.info?.title || c.img.name,
      storage_path: uploaded[i],
      expires_on: expires(c.info?.expiry),
      gen_prompt: c.info?.prompt || null,
      gen_target: c.info?.target || null,
    })) as never,
  });
  if (error || !data) {
    await supabase.storage.from("facility-files").remove(uploaded);
    return { error: "取り込めませんでした。同じ画像の組み合わせは取込済みかもしれません。" };
  }
  return { jobId: data, count: fresh.length, updated: 0, infoRows };
}
