"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canSetBudgetCap } from "@/lib/core/permissions";
import { recordOperation } from "@/lib/server/audit";
import { requireFacility } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type BudgetState = { error?: string; ok?: boolean };

const yen = z
  .string()
  .transform((v) => v.replace(/[,，\s円]/g, ""))
  .pipe(z.string().regex(/^\d{1,12}$/))
  .transform(Number);

/** 月間予算上限の設定（施設管理者だけ）。サーバーでも権限を確かめ、DB の制限でも拒否される。 */
export async function updateBudgetCap(_prev: BudgetState, form: FormData): Promise<BudgetState> {
  const { ctx, facility, roles } = await requireFacility(String(form.get("code") ?? ""));
  if (!canSetBudgetCap(roles)) {
    return { error: "月間予算上限を変えられるのは施設管理者だけです。" };
  }
  const parsed = yen.safeParse(String(form.get("cap") ?? ""));
  if (!parsed.success) return { error: "金額は円の整数で入力してください。" };

  const supabase = await userClient();
  const { data, error } = await supabase
    .from("facility")
    .update({
      monthly_budget_cap_yen: parsed.data,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", facility.id)
    .select("id");
  if (error || !data?.length) return { error: "保存できませんでした。権限を確かめてください。" };

  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "月間予算上限を変更",
    targetType: "facility",
    targetId: facility.id,
    detail: { before: facility.monthly_budget_cap_yen, after: parsed.data },
  });
  revalidatePath(`/f/${facility.code}`);
  return { ok: true };
}
