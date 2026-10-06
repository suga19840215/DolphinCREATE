"use server";

import { redirect } from "next/navigation";
import { PASSWORD_PROBLEM_MESSAGE, checkPassword } from "@/lib/core/password";
import { recordAuthEvent } from "@/lib/server/audit";
import { isBreachedPassword } from "@/lib/server/breached-password";
import { adminClient, userClient } from "@/lib/server/supabase";

export type PasswordState = { error?: string };

/**
 * パスワードの設定（招待・再設定メールから来た人と、ログイン中に変更する人の両方）。
 * 設定したらいったんログアウトし、新しいパスワード（と多要素認証）で入り直してもらう。
 */
export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const supabase = await userClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");

  const admin = adminClient();
  const { data: user } = await admin
    .from("app_user")
    .select("id, email, status, facility_id")
    .eq("id", uid)
    .maybeSingle();
  if (!user) redirect("/login");

  const password = String(form.get("password") ?? "");
  const problem = checkPassword(password, String(form.get("confirm") ?? ""), user.email);
  if (problem) return { error: PASSWORD_PROBLEM_MESSAGE[problem] };
  if ((await isBreachedPassword(password)) === true)
    return { error: PASSWORD_PROBLEM_MESSAGE.breached };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "パスワードを設定できませんでした。もう一度お試しください。" };

  await admin
    .from("app_user")
    .update({
      status: user.status === "invited" ? "active" : user.status,
      failed_login_count: 0,
      locked_until: null,
      lock_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  await recordAuthEvent("password_changed", { userId: user.id, facilityId: user.facility_id });
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reason=password");
}
