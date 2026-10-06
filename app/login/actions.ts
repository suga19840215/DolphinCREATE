"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { afterFailedLogin, afterSuccessfulLogin, isLocked } from "@/lib/core/lockout";
import { recordAuthEvent } from "@/lib/server/audit";
import { adminClient, userClient } from "@/lib/server/supabase";

export type LoginState = { error?: string; email?: string };

// どの項目が違うか・ロック中かどうかは出さない（本番設計：エラー表示）
const GENERIC_ERROR =
  "ログインできませんでした。メールアドレスとパスワードを確かめてください。続けて失敗するとしばらく使えなくなります。";

const schema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password") });
  const emailInput = String(form.get("email") ?? "").slice(0, 200);
  if (!parsed.success) {
    return { error: "メールアドレスとパスワードを入力してください。", email: emailInput };
  }
  const { email, password } = parsed.data;
  const admin = adminClient();
  const now = new Date();

  const { data: user } = await admin
    .from("app_user")
    .select("id, facility_id, status, failed_login_count, locked_until, lock_count")
    .eq("email", email)
    .maybeSingle();

  const lockState = user && {
    failedLoginCount: user.failed_login_count,
    lockedUntil: user.locked_until ? new Date(user.locked_until) : null,
    lockCount: user.lock_count,
  };

  // ロック中・停止中は、パスワードが正しくても入れない（受入テスト5・6）
  if (user && lockState && isLocked(lockState, now)) {
    await recordAuthEvent("login_locked", { userId: user.id, facilityId: user.facility_id, email });
    return { error: GENERIC_ERROR, email };
  }
  if (user && user.status !== "active") {
    await recordAuthEvent("login_failed", {
      userId: user.id,
      facilityId: user.facility_id,
      email,
      detail: { reason: user.status },
    });
    return { error: GENERIC_ERROR, email };
  }

  const supabase = await userClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !user || !lockState) {
    if (!error) await supabase.auth.signOut({ scope: "local" }); // 認証はあるが利用者の登録がない
    if (user && lockState) {
      const next = afterFailedLogin(lockState, now);
      await admin
        .from("app_user")
        .update({
          failed_login_count: next.failedLoginCount,
          locked_until: next.lockedUntil?.toISOString() ?? null,
          lock_count: next.lockCount,
        })
        .eq("id", user.id);
      await recordAuthEvent(next.lockedNow ? "locked_out" : "login_failed", {
        userId: user.id,
        facilityId: user.facility_id,
        email,
        detail: { failed_login_count: next.failedLoginCount, lock_count: next.lockCount },
      });
    } else {
      await recordAuthEvent("login_failed", { email, detail: { reason: "unknown_email" } });
    }
    return { error: GENERIC_ERROR, email };
  }

  const reset = afterSuccessfulLogin();
  await admin
    .from("app_user")
    .update({
      failed_login_count: reset.failedLoginCount,
      locked_until: null,
      lock_count: reset.lockCount,
      last_login_at: now.toISOString(),
    })
    .eq("id", user.id);
  await recordAuthEvent("login_succeeded", {
    userId: user.id,
    facilityId: user.facility_id,
    email,
  });

  // 多要素認証が必要な人は /mfa へ（requireUser が判定する）
  redirect("/");
}

export async function logout() {
  const supabase = await userClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (uid) {
    const { data: u } = await adminClient()
      .from("app_user")
      .select("facility_id")
      .eq("id", uid)
      .maybeSingle();
    await recordAuthEvent("logout", { userId: uid, facilityId: u?.facility_id ?? null });
  }
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?reason=logout");
}
