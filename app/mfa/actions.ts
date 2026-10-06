"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAuthEvent } from "@/lib/server/audit";
import { getSession } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type MfaState = { error?: string };

const schema = z.object({
  factorId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  mode: z.enum(["enroll", "verify"]),
});

export async function verifyMfa(_prev: MfaState, form: FormData): Promise<MfaState> {
  const session = await getSession();
  if (session === null || session === "expired") redirect("/login");
  const parsed = schema.safeParse({
    factorId: form.get("factorId"),
    code: String(form.get("code") ?? "").replace(/\s/g, ""),
    mode: form.get("mode"),
  });
  if (!parsed.success) return { error: "認証アプリに表示されている6桁の数字を入力してください。" };

  const supabase = await userClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    await recordAuthEvent("mfa_failed", {
      userId: session.userId,
      facilityId: session.homeFacility.id,
    });
    return {
      error: "確認コードが違うか、有効期限が切れています。新しいコードを入力してください。",
    };
  }
  await recordAuthEvent(parsed.data.mode === "enroll" ? "mfa_enrolled" : "mfa_verified", {
    userId: session.userId,
    facilityId: session.homeFacility.id,
  });
  redirect("/");
}
