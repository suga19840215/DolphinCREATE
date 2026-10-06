"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canImport } from "@/lib/core/permissions";
import { recordOperation } from "@/lib/server/audit";
import {
  commitImageImport,
  commitMarketReport,
  commitTableImport,
  previewTableImport,
  type Media,
  type PreviewResult,
} from "@/lib/server/imports";
import { requireFacility } from "@/lib/server/session";

export type ImportActionState =
  | { step: "idle"; error?: string }
  | { step: "preview"; result: PreviewResult; kind: string; media: string | null }
  | { step: "done"; message: string };

const tableKind = z.enum(["consultation", "crm", "ads", "ga4"]);
const media = z.enum(["google_search", "demand_gen", "meta"]).nullable();
const mapSchema = z.record(z.string(), z.number().int()).optional();

async function readFile(form: FormData, name: string) {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function context(form: FormData, kind: Parameters<typeof canImport>[1]) {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canImport(roles, kind)) return { error: "この取込を行う権限がありません。" } as const;
  return { ctx, facility } as const;
}

/** 下見（件数・対応付け・先頭5行）。対応付けを変えたときもここを呼ぶ。 */
export async function previewImport(
  _prev: ImportActionState,
  form: FormData,
): Promise<ImportActionState> {
  const kind = tableKind.safeParse(form.get("kind"));
  if (!kind.success) return { step: "idle", error: "取込の種類を選んでください。" };
  const c = await context(form, kind.data);
  if ("error" in c) return { step: "idle", error: c.error };
  const file = await readFile(form, "file");
  if (!file) return { step: "idle", error: "ファイルを選んでください。" };
  const m = media.safeParse(form.get("media") || null);
  let map: Record<string, number> | undefined;
  try {
    map = mapSchema.parse(form.get("map") ? JSON.parse(String(form.get("map"))) : undefined);
  } catch {
    map = undefined;
  }
  const result = await previewTableImport({
    facility: c.facility,
    kind: kind.data,
    media: (m.success ? m.data : null) as Media | null,
    fileName: file.name,
    bytes: file.bytes,
    map,
  });
  if ("error" in result) return { step: "idle", error: result.error };
  return { step: "preview", result, kind: kind.data, media: m.success ? m.data : null };
}

/** 取込の確定。サーバーで数え直してから取り込む。 */
export async function commitImport(
  _prev: ImportActionState,
  form: FormData,
): Promise<ImportActionState> {
  const kind = tableKind.safeParse(form.get("kind"));
  if (!kind.success) return { step: "idle", error: "取込の種類を選んでください。" };
  const c = await context(form, kind.data);
  if ("error" in c) return { step: "idle", error: c.error };
  const file = await readFile(form, "file");
  if (!file) return { step: "idle", error: "ファイルを選び直してください。" };
  const m = media.safeParse(form.get("media") || null);
  let map: Record<string, number> | undefined;
  try {
    map = mapSchema.parse(form.get("map") ? JSON.parse(String(form.get("map"))) : undefined);
  } catch {
    map = undefined;
  }
  const res = await commitTableImport({
    facility: c.facility,
    kind: kind.data,
    media: (m.success ? m.data : null) as Media | null,
    fileName: file.name,
    bytes: file.bytes,
    map,
  });
  if ("error" in res) return { step: "idle", error: res.error };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "データを取り込み",
    targetType: "import_job",
    targetId: res.jobId,
    detail: { kind: kind.data, rows: res.count, updated: res.updated },
  });
  revalidatePath(`/f/${c.facility.code}`, "layout");
  const upd = res.updated ? `（うち${res.updated}件は登録済みの内容を更新）` : "";
  return { step: "done", message: `${res.count}件を取り込みました${upd}。` };
}

export async function importImages(
  _prev: ImportActionState,
  form: FormData,
): Promise<ImportActionState> {
  const c = await context(form, "images");
  if ("error" in c) return { step: "idle", error: c.error };
  const images: { name: string; bytes: Uint8Array }[] = [];
  for (const f of form.getAll("images")) {
    if (f instanceof File && f.size > 0)
      images.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  const info = (await readFile(form, "info")) ?? undefined;
  const res = await commitImageImport({ facility: c.facility, images, info });
  if ("error" in res) return { step: "idle", error: res.error };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "Dolphin生成画像を取り込み",
    targetType: "import_job",
    targetId: res.jobId,
    detail: { images: res.count },
  });
  revalidatePath(`/f/${c.facility.code}`, "layout");
  return {
    step: "done",
    message: `${res.count}枚を取り込みました。権利確認中・未承認の状態です。Bさんの権利確認と会場担当の承認を経て広告に使えます。`,
  };
}

export async function importMarketReport(
  _prev: ImportActionState,
  form: FormData,
): Promise<ImportActionState> {
  const c = await context(form, "market_report");
  if ("error" in c) return { step: "idle", error: c.error };
  const file = await readFile(form, "file");
  if (!file) return { step: "idle", error: "JSON ファイルを選んでください。" };
  const res = await commitMarketReport({
    facility: c.facility,
    fileName: file.name,
    bytes: file.bytes,
  });
  if ("error" in res) return { step: "idle", error: res.error };
  await recordOperation({
    facilityId: c.facility.id,
    actorId: c.ctx.userId,
    action: "マーケットレポートを取り込み",
    targetType: "import_job",
    targetId: res.jobId,
  });
  revalidatePath(`/f/${c.facility.code}`, "layout");
  return { step: "done", message: `マーケットレポート ${res.count}件を取り込みました。` };
}
