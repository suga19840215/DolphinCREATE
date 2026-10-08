"use server";

import { revalidatePath } from "next/cache";
import { canImport } from "@/lib/core/permissions";
import { normalizePath, validRule } from "@/lib/core/site/pages";
import { recordOperation } from "@/lib/server/audit";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type RuleState = { error?: string; ok?: string };

/** ページの分類を追加（Aさん・施設管理者）。同じ URL があれば名前と種類を上書きする */
export async function savePageRule(_prev: RuleState, form: FormData): Promise<RuleState> {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canImport(roles, "ga4"))
    return { error: "ページの分類は、マーケ・データ（Aさん）と施設管理者が登録します。" };
  const rule = {
    prefix: normalizePath(String(form.get("prefix") ?? "")),
    label: String(form.get("label") ?? "").trim(),
    kind: String(form.get("kind") ?? ""),
  };
  const problem = validRule(rule);
  if (problem) return { error: problem };
  const supabase = await userClient();
  const { data: existing } = await supabase
    .from("page_category")
    .select("id")
    .eq("facility_id", facility.id)
    .eq("prefix", rule.prefix)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from("page_category")
        .update({ label: rule.label, kind: rule.kind })
        .eq("id", existing.id)
    : await supabase
        .from("page_category")
        .insert({ facility_id: facility.id, ...rule, created_by: ctx.userId });
  if (error) return { error: "保存できませんでした。権限を確かめてください。" };
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "ページの分類を登録",
    detail: rule,
  });
  revalidatePath(`/f/${facility.code}/funnel`);
  return { ok: `${rule.prefix} を「${rule.label}」として登録しました。` };
}

export async function deletePageRule(form: FormData) {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canImport(roles, "ga4")) return;
  const id = String(form.get("id") ?? "");
  const supabase = await userClient();
  const { data } = await supabase
    .from("page_category")
    .delete()
    .eq("id", id)
    .eq("facility_id", facility.id)
    .select("prefix");
  if (data?.length) {
    await recordOperation({
      facilityId: facility.id,
      actorId: ctx.userId,
      action: "ページの分類を削除",
      detail: { prefix: data[0]!.prefix },
    });
  }
  revalidatePath(`/f/${facility.code}/funnel`);
}
