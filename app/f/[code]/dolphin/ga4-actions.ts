"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isPropertyId } from "@/lib/core/ga4/transform";
import { canImport } from "@/lib/core/permissions";
import { recordOperation } from "@/lib/server/audit";
import { syncGa4 } from "@/lib/server/ga4/sync";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type Ga4State = { error?: string; ok?: string };

/** GA4 プロパティ ID の登録・変更（Aさん・施設管理者） */
export async function saveGa4Property(_prev: Ga4State, form: FormData): Promise<Ga4State> {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canImport(roles, "ga4"))
    return { error: "GA4 の接続を設定できるのは、マーケ・データ（Aさん）と施設管理者です。" };
  const propertyId = String(form.get("propertyId") ?? "").trim();
  if (!isPropertyId(propertyId)) {
    return {
      error:
        "GA4 プロパティ ID は数字だけです（G- で始まる測定 ID ではありません）。GA4 の「管理 → プロパティの詳細」で確認できます。",
    };
  }
  const enabled = form.get("enabled") === "on";
  const supabase = await userClient();
  const { data: existing } = await supabase
    .from("facility_connection")
    .select("id")
    .eq("facility_id", facility.id)
    .eq("provider", "ga4")
    .maybeSingle();
  const now = new Date().toISOString();
  const { error } = existing
    ? await supabase
        .from("facility_connection")
        .update({
          account_ref: propertyId,
          enabled,
          updated_by: ctx.userId,
          updated_at: now,
          last_status: null,
          last_error: null,
        })
        .eq("id", existing.id)
    : await supabase.from("facility_connection").insert({
        facility_id: facility.id,
        provider: "ga4",
        account_ref: propertyId,
        enabled,
        created_by: ctx.userId,
        updated_by: ctx.userId,
        updated_at: now,
      });
  if (error) return { error: "保存できませんでした。権限を確かめてください。" };
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "GA4 の接続を設定",
    targetType: "facility_connection",
    detail: { property_id: propertyId, enabled },
  });
  revalidatePath(`/f/${facility.code}/dolphin`);
  return { ok: "保存しました。" };
}

const rangeSchema = z
  .object({ startDate: z.iso.date(), endDate: z.iso.date() })
  .refine((r) => r.startDate <= r.endDate, "開始日は終了日より前にしてください。")
  .refine(
    (r) => Date.parse(r.endDate) - Date.parse(r.startDate) <= 400 * 86_400_000,
    "一度に取り込めるのは400日までです。",
  );

/** 今すぐ取り込む（期間を指定） */
export async function runGa4Now(_prev: Ga4State, form: FormData): Promise<Ga4State> {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canImport(roles, "ga4"))
    return { error: "GA4 の取込は、マーケ・データ（Aさん）と施設管理者が行います。" };
  const range = rangeSchema.safeParse({
    startDate: form.get("startDate"),
    endDate: form.get("endDate"),
  });
  if (!range.success)
    return { error: range.error.issues[0]?.message ?? "期間を正しく入力してください。" };

  const supabase = await userClient();
  const { data: conn } = await supabase
    .from("facility_connection")
    .select("account_ref, enabled")
    .eq("facility_id", facility.id)
    .eq("provider", "ga4")
    .maybeSingle();
  if (!conn) return { error: "先に GA4 プロパティ ID を登録してください。" };

  const result = await syncGa4({
    facilityId: facility.id,
    propertyId: conn.account_ref,
    range: range.data,
    mode: "manual",
  });
  revalidatePath(`/f/${facility.code}`, "layout");
  if (result.status === "error") return { error: result.message };
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "GA4 から取り込み（手動）",
    targetType: "import_job",
    targetId: result.status === "imported" ? result.jobId : undefined,
    detail: { ...range.data, status: result.status },
  });
  if (result.status === "unchanged") return { ok: "GA4 の値に変わりはありませんでした。" };
  const upd = result.updated ? `（うち${result.updated}件は登録済みの内容を更新）` : "";
  return { ok: `GA4 から ${result.rows}件（日付×広告×LP）を取り込みました${upd}。` };
}
