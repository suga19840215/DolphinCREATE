"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APPEAL_AXES } from "@/lib/content/appeal-axes";
import { toSavePayload } from "@/lib/core/media/confirm";
import { MATCH_LABEL, matchLevel } from "@/lib/core/media/match";
import { isOutlet, OUTLET_LABEL } from "@/lib/core/media/outlets";
import { parseNumber } from "@/lib/core/media/sheet";
import { canEditMedia } from "@/lib/core/permissions";
import { runAi } from "@/lib/server/ai/client";
import { recordOperation } from "@/lib/server/audit";
import { loadMainCustomers } from "@/lib/server/media/data";
import { docKind, MEDIA_DOC_MAX_BYTES, readMediaDocument } from "@/lib/server/media/read";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type MediaState = { error?: string; ok?: string };

async function editor(form: FormData) {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canEditMedia(roles))
    return { error: "この操作は、マーケ・データ（Aさん）と施設管理者が行います。" } as const;
  return { ctx, facility } as const;
}

const done = (code: string) => revalidatePath(`/f/${code}/media`);

/** 資料を入れる：保管して読み取り、下書きにする（確定するまで評価の表には入らない） */
export async function uploadMediaDoc(_prev: MediaState, form: FormData): Promise<MediaState> {
  const c = await editor(form);
  if ("error" in c) return { error: c.error };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "資料のファイルを選んでください。" };
  if (file.size > MEDIA_DOC_MAX_BYTES) return { error: "4MB までのファイルにしてください。" };
  const kind = docKind(file.name);
  if (kind === "old")
    return { error: "古い形式（.xls／.doc）は読めません。.xlsx／.docx で保存し直してください。" };
  if (!kind) return { error: "Excel（.xlsx）・CSV・Word（.docx）・PDF を選んでください。" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = createHash("sha256").update(bytes).digest("hex");
  const supabase = await userClient();
  const { data: same } = await supabase
    .from("media_doc")
    .select("confirmed_at")
    .eq("facility_id", c.facility.id)
    .eq("file_sha256", sha)
    .eq("status", "confirmed")
    .limit(1);
  if (same?.length)
    return {
      error:
        "同じ資料はすでに確定しています。内容を直すときは、下の「数値の入力・修正」を使ってください。",
    };

  const storagePath = `${c.facility.id}/media-docs/${randomUUID()}.${kind}`;
  const { error: upErr } = await supabase.storage
    .from("facility-files")
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { error: "資料を保管できませんでした。権限を確かめてください。" };
  const { data: doc, error } = await supabase
    .from("media_doc")
    .insert({
      facility_id: c.facility.id,
      file_name: file.name.slice(0, 300),
      content_type: (file.type || "application/octet-stream").slice(0, 200),
      size_bytes: file.size,
      file_sha256: sha,
      storage_path: storagePath,
      uploaded_by: c.ctx.userId,
    })
    .select("id")
    .single();
  if (error || !doc) {
    await supabase.storage.from("facility-files").remove([storagePath]);
    return { error: "資料を登録できませんでした。" };
  }

  const read = await readMediaDocument({
    facilityId: c.facility.id,
    docId: doc.id,
    fileName: file.name,
    sha256: sha,
    bytes,
    runBy: c.ctx.userId,
  });
  await supabase
    .from("media_doc")
    .update(
      read.ok
        ? { status: "parsed", method: read.method, draft: read.rows, message: read.message }
        : { status: "failed", message: read.error },
    )
    .eq("id", doc.id);
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "媒体の資料を取込（読み取り）",
    targetType: "media_doc",
    targetId: doc.id,
    detail: {
      file: file.name,
      method: read.ok ? read.method : "failed",
      rows: read.ok ? read.rows.length : 0,
    },
  });
  done(c.facility.code);
  return read.ok
    ? { ok: `${read.message} 下の「確認待ちの資料」で確かめて、確定してください。` }
    : { error: read.error };
}

/** 確認画面で直した下書きを確定し、評価の表に入れる */
export async function confirmMediaDoc(_prev: MediaState, form: FormData): Promise<MediaState> {
  const c = await editor(form);
  if ("error" in c) return { error: c.error };
  const docId = String(form.get("doc") ?? "");
  let rows: unknown[];
  try {
    rows = z.array(z.unknown()).parse(JSON.parse(String(form.get("rows") ?? "[]")));
  } catch {
    return { error: "確認の内容を読めませんでした。画面を読み込み直してください。" };
  }
  const payload = toSavePayload(rows);
  if (payload.problems.length) return { error: payload.problems.slice(0, 5).join("／") };
  if (!payload.results.length && !payload.areas.length)
    return { error: "確定する行がありません。" };
  const supabase = await userClient();
  const { data: doc } = await supabase
    .from("media_doc")
    .select("id, status")
    .eq("id", docId)
    .eq("facility_id", c.facility.id)
    .maybeSingle();
  if (!doc || doc.status !== "parsed")
    return { error: "この資料は確定できません（確定済み・取り消し済みの可能性があります）。" };
  const { error } = await supabase.rpc("save_media_rows", {
    fid: c.facility.id,
    doc: doc.id,
    results: payload.results,
    areas: payload.areas,
  });
  if (error) return { error: "保存できませんでした。権限を確かめてください。" };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "媒体の資料を確定",
    targetType: "media_doc",
    targetId: doc.id,
    detail: { results: payload.results.length, areas: payload.areas.length },
  });
  done(c.facility.code);
  // 確定した資料は「確認待ち」から消えるので、結果は画面の上に出す（確定した月を表示する）
  const latest = [...payload.results, ...payload.areas]
    .map((r) => r.month.slice(0, 7))
    .sort()
    .at(-1)!;
  redirect(
    `/f/${c.facility.code}/media?from=${latest}&to=${latest}&saved=${payload.results.length}-${payload.areas.length}#docs`,
  );
}

export async function discardMediaDoc(form: FormData) {
  const c = await editor(form);
  if ("error" in c) return;
  const supabase = await userClient();
  await supabase
    .from("media_doc")
    .update({ status: "discarded" })
    .eq("id", String(form.get("doc") ?? ""))
    .eq("facility_id", c.facility.id)
    .in("status", ["parsed", "failed"]);
  done(c.facility.code);
}

/** 数値の入力・修正（目標来館など、資料にない値） */
export async function saveMediaValues(_prev: MediaState, form: FormData): Promise<MediaState> {
  const c = await editor(form);
  if ("error" in c) return { error: c.error };
  const month = String(form.get("month") ?? "");
  const outlet = String(form.get("outlet") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "月を選んでください。" };
  if (!isOutlet(outlet)) return { error: "媒体を選んでください。" };
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    if (!v) return { ok: true as const, v: null };
    const n = parseNumber(v);
    return n === null || n < 0
      ? { ok: false as const, v: null }
      : { ok: true as const, v: Math.floor(n) };
  };
  const fields = {
    cost_yen: num("cost_yen"),
    visits: num("visits"),
    contracts: num("contracts"),
    target_visits: num("target_visits"),
  };
  if (Object.values(fields).some((f) => !f.ok))
    return { error: "金額・件数は0以上の数で入力してください。" };
  if (Object.values(fields).every((f) => f.v === null))
    return { error: "金額・来館・成約・目標のどれかを入力してください。" };
  const row = {
    month: `${month}-01`,
    outlet,
    menu: String(form.get("menu") ?? "")
      .trim()
      .slice(0, 100),
    cost_yen: fields.cost_yen.v,
    visits: fields.visits.v,
    contracts: fields.contracts.v,
    target_visits: fields.target_visits.v,
  };
  const supabase = await userClient();
  const { error } = await supabase.rpc("save_media_rows", {
    fid: c.facility.id,
    doc: null as unknown as string,
    results: [row],
    areas: [],
  });
  if (error) return { error: "保存できませんでした。権限を確かめてください。" };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "媒体の数値を入力",
    detail: row,
  });
  done(c.facility.code);
  return { ok: `${OUTLET_LABEL[outlet]}（${month.replace("-", "年")}月）を保存しました。` };
}

const AXIS_CODES = new Set<string>(APPEAL_AXES.map((a) => a.code));
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** 媒体の TOP 広告（メインビジュアル・キャッチコピー）と訴求の分類 */
export async function saveTopAd(_prev: MediaState, form: FormData): Promise<MediaState> {
  const c = await editor(form);
  if ("error" in c) return { error: c.error };
  const outlet = String(form.get("outlet") ?? "");
  if (!isOutlet(outlet)) return { error: "媒体を選んでください。" };
  const catchText = String(form.get("catch_text") ?? "")
    .trim()
    .slice(0, 200);
  const visualAxes = form
    .getAll("visual_axes")
    .map(String)
    .filter((a) => AXIS_CODES.has(a));
  const catchAxes = form
    .getAll("catch_axes")
    .map(String)
    .filter((a) => AXIS_CODES.has(a));
  if (!visualAxes.length && !catchAxes.length && !catchText)
    return { error: "キャッチコピーか訴求の分類を入力してください。" };

  const supabase = await userClient();
  const { data: current } = await supabase
    .from("media_top_ad")
    .select("visual_path")
    .eq("facility_id", c.facility.id)
    .eq("outlet", outlet)
    .maybeSingle();
  let visualPath = current?.visual_path ?? null;
  const image = form.get("visual");
  if (image instanceof File && image.size > 0) {
    const ext = IMAGE_TYPES[image.type];
    if (!ext) return { error: "画像は PNG・JPEG・WebP にしてください。" };
    if (image.size > MEDIA_DOC_MAX_BYTES) return { error: "画像は 4MB までにしてください。" };
    const path = `${c.facility.id}/media-ads/${outlet}-${randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("facility-files")
      .upload(path, new Uint8Array(await image.arrayBuffer()), { contentType: image.type });
    if (error) return { error: "画像を保管できませんでした。" };
    if (visualPath) await supabase.storage.from("facility-files").remove([visualPath]);
    visualPath = path;
  }
  const { error } = await supabase.from("media_top_ad").upsert(
    {
      facility_id: c.facility.id,
      outlet,
      catch_text: catchText,
      visual_path: visualPath,
      visual_axes: visualAxes,
      catch_axes: catchAxes,
      updated_by: c.ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "facility_id,outlet" },
  );
  if (error) return { error: "保存できませんでした。権限を確かめてください。" };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "媒体の TOP 広告を登録",
    detail: { outlet, visual_axes: visualAxes, catch_axes: catchAxes },
  });
  done(c.facility.code);
  return { ok: `${OUTLET_LABEL[outlet]}の TOP 広告を保存しました。` };
}

const MatchCommentSchema = z.object({
  reason: z.string(),
  visual_suggestion: z.string(),
  catch_suggestions: z.array(z.string()),
  caution: z.string(),
});
export type MatchComment = z.infer<typeof MatchCommentSchema>;
export type MatchCommentState = { error?: string; comment?: MatchComment; outlet?: string };

/** 合致の判定に、AI が理由と改善案を補足する（判定そのものは分類で決めたまま） */
export async function commentOnMatch(
  _prev: MatchCommentState,
  form: FormData,
): Promise<MatchCommentState> {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canEditMedia(roles))
    return { error: "AI の補足は、マーケ・データ（Aさん）と施設管理者が使えます。" };
  const outlet = String(form.get("outlet") ?? "");
  if (!isOutlet(outlet)) return { error: "媒体を選んでください。" };
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const supabase = await userClient();
  const [{ data: ad }, customers] = await Promise.all([
    supabase
      .from("media_top_ad")
      .select("catch_text, visual_axes, catch_axes")
      .eq("facility_id", facility.id)
      .eq("outlet", outlet)
      .maybeSingle(),
    loadMainCustomers(supabase, facility.id, { from, to }),
  ]);
  const customer = customers[outlet];
  if (!ad) return { error: "先に TOP 広告を登録してください。" };
  if (!customer || !customer.n)
    return {
      error: "この媒体から来館した接客のデータがありません（Dolphin の流入元を確かめてください）。",
    };
  const axisLabel = (code: string) => APPEAL_AXES.find((a) => a.code === code)?.label ?? code;
  // AI に渡すのは、この施設の匿名の集計値と広告の文言だけ（個人の発言・他施設のデータは渡さない）
  const input = {
    facility_id: facility.id,
    outlet: OUTLET_LABEL[outlet],
    visitors: {
      n: customer.n,
      clusters: customer.clusters,
      ages: customer.ages,
      areas: customer.areas,
      main_axes: customer.axes.map((a) => ({
        axis: axisLabel(a.key),
        n: a.n,
        share: Math.round(a.share * 100) / 100,
      })),
    },
    top_ad: {
      catch_text: ad.catch_text,
      visual_axes: ad.visual_axes.map(axisLabel),
      catch_axes: ad.catch_axes.map(axisLabel),
    },
    system_judgement: {
      visual: MATCH_LABEL[matchLevel(customer, ad.visual_axes, facility.min_n)],
      catch: MATCH_LABEL[matchLevel(customer, ad.catch_axes, facility.min_n)],
    },
  };
  const ai = await runAi({
    facilityId: facility.id,
    purpose: "M2 媒体の合致の補足",
    promptFile: "m2-media-match.md",
    content: [{ type: "text", text: JSON.stringify(input) }],
    logInput: input,
    schema: MatchCommentSchema,
    runBy: ctx.userId,
  });
  if (!ai.ok) return { error: ai.error, outlet };
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "AI の補足（媒体の合致）",
    targetType: "ai_run_log",
    targetId: ai.runId,
  });
  return { comment: ai.data, outlet };
}
