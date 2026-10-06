"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildRoleRows } from "@/lib/core/accounts";
import { afterAdminUnlock } from "@/lib/core/lockout";
import { assignableRoles, canManageUser, isRole, type Role } from "@/lib/core/permissions";
import { hqFacilityId, recordAuthEvent, recordOperation } from "@/lib/server/audit";
import { serverEnv } from "@/lib/server/env";
import { requireUser, type SessionContext } from "@/lib/server/session";
import { adminClient } from "@/lib/server/supabase";

export type ActionState = { error?: string; ok?: string };

const fail = (error: string): ActionState => ({ error });

/** 操作する人が、その施設で持っている権限（多要素認証済みのセッションでだけ有効） */
function actorRolesAt(ctx: SessionContext, facilityId: string): Role[] {
  return ctx.rolesByFacility.get(facilityId)?.roles ?? [];
}

async function loadTarget(userId: string) {
  const admin = adminClient();
  const { data: user } = await admin
    .from("app_user")
    .select("id, email, display_name, status, facility:facility_id (id, code, name, kind)")
    .eq("id", userId)
    .maybeSingle();
  if (!user?.facility) return null;
  const { data: roles } = await admin
    .from("user_facility_role")
    .select("role")
    .eq("user_id", userId);
  return {
    ...user,
    facility: user.facility,
    roles: (roles ?? []).map((r) => r.role).filter(isRole),
  };
}

async function venueIds(): Promise<string[]> {
  const { data } = await adminClient().from("facility").select("id").eq("kind", "venue");
  return (data ?? []).map((f) => f.id);
}

const inviteSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  displayName: z.string().trim().min(1).max(100),
  facilityId: z.uuid(),
  roles: z.array(z.string()).min(1),
  assigned: z.array(z.uuid()),
});

/** アカウントの招待（本人が招待メールのリンクからパスワードを設定する） */
export async function inviteUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = inviteSchema.safeParse({
    email: form.get("email"),
    displayName: form.get("displayName"),
    facilityId: form.get("facilityId"),
    roles: form.getAll("roles"),
    assigned: form.getAll("assigned"),
  });
  if (!parsed.success) return fail("メールアドレス・氏名・所属・権限を入力してください。");
  const { email, displayName, facilityId, assigned } = parsed.data;
  const roles = parsed.data.roles.filter(isRole);

  const admin = adminClient();
  const { data: home } = await admin
    .from("facility")
    .select("id, kind")
    .eq("id", facilityId)
    .maybeSingle();
  if (!home) return fail("所属が正しくありません。");

  const allowed = assignableRoles(actorRolesAt(ctx, home.id), home.kind);
  if (!roles.length || roles.some((r) => !allowed.includes(r))) {
    return fail("この権限のアカウントは発行できません。");
  }
  let rows;
  try {
    rows = buildRoleRows({
      homeFacility: home,
      roles,
      assignedVenueIds: assigned,
      allVenueIds: await venueIds(),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "権限が正しくありません。");
  }
  if (!rows.length) return fail("担当する施設を1つ以上選んでください。");

  const { data: exists } = await admin
    .from("app_user")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (exists) return fail("このメールアドレスのアカウントはすでにあります。");

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${serverEnv().APP_URL}/auth/confirm`,
    data: { display_name: displayName },
  });
  if (error || !invited.user)
    return fail("招待メールを送れませんでした。メールアドレスを確かめてください。");

  const { error: insertError } = await admin.from("app_user").insert({
    id: invited.user.id,
    facility_id: home.id,
    email,
    display_name: displayName,
    status: "invited",
    created_by: ctx.userId,
  });
  if (insertError) return fail("アカウントを登録できませんでした。");
  await admin.from("user_facility_role").insert(
    rows.map((r) => ({
      user_id: invited.user.id,
      facility_id: r.facilityId,
      role: r.role,
      created_by: ctx.userId,
    })),
  );
  await recordAuthEvent("invited", {
    facilityId: home.id,
    userId: invited.user.id,
    actorId: ctx.userId,
    email,
    detail: { roles },
  });
  revalidatePath("/accounts");
  return { ok: `${displayName}さんに招待メールを送りました。` };
}

const updateSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(1).max(100),
  roles: z.array(z.string()).min(1),
  assigned: z.array(z.uuid()),
});

/** 氏名と権限の変更 */
export async function updateUserRoles(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = updateSchema.safeParse({
    userId: form.get("userId"),
    displayName: form.get("displayName"),
    roles: form.getAll("roles"),
    assigned: form.getAll("assigned"),
  });
  if (!parsed.success) return fail("氏名と権限を入力してください。");
  const target = await loadTarget(parsed.data.userId);
  if (!target) return fail("アカウントが見つかりません。");
  if (target.id === ctx.userId)
    return fail("自分の権限は変更できません。ほかの管理者に依頼してください。");

  const actorRoles = actorRolesAt(ctx, target.facility.id);
  const roles = parsed.data.roles.filter(isRole);
  const allowed = assignableRoles(actorRoles, target.facility.kind);
  if (!canManageUser(actorRoles, target.roles) || roles.some((r) => !allowed.includes(r))) {
    return fail("このアカウントの権限は変更できません。");
  }
  let rows;
  try {
    rows = buildRoleRows({
      homeFacility: target.facility,
      roles,
      assignedVenueIds: parsed.data.assigned,
      allVenueIds: await venueIds(),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "権限が正しくありません。");
  }
  if (!rows.length) return fail("担当する施設を1つ以上選んでください。");

  const admin = adminClient();
  await admin
    .from("app_user")
    .update({
      display_name: parsed.data.displayName,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", target.id);
  await admin.from("user_facility_role").delete().eq("user_id", target.id);
  await admin.from("user_facility_role").insert(
    rows.map((r) => ({
      user_id: target.id,
      facility_id: r.facilityId,
      role: r.role,
      created_by: ctx.userId,
    })),
  );
  await recordAuthEvent("roles_changed", {
    facilityId: target.facility.id,
    userId: target.id,
    actorId: ctx.userId,
    detail: { before: target.roles, after: roles },
  });
  revalidatePath("/accounts");
  return { ok: "保存しました。" };
}

const targetSchema = z.object({ userId: z.uuid() });

async function manageable(ctx: SessionContext, userId: string) {
  const target = await loadTarget(userId);
  if (!target || target.id === ctx.userId) return null;
  return canManageUser(actorRolesAt(ctx, target.facility.id), target.roles) ? target : null;
}

/** 停止・再開。削除はしない（承認履歴に名前が残るため）。停止すると次の操作から使えない。 */
export async function setSuspended(form: FormData) {
  const ctx = await requireUser();
  const parsed = targetSchema.safeParse({ userId: form.get("userId") });
  const suspend = form.get("suspend") === "1";
  if (!parsed.success) return;
  const target = await manageable(ctx, parsed.data.userId);
  if (!target || target.status === "invited") return;

  const admin = adminClient();
  await admin
    .from("app_user")
    .update({
      status: suspend ? "suspended" : "active",
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", target.id);
  await recordAuthEvent(suspend ? "suspended" : "resumed", {
    facilityId: target.facility.id,
    userId: target.id,
    actorId: ctx.userId,
  });
  revalidatePath("/accounts");
}

/** ロック解除 */
export async function unlockUser(form: FormData) {
  const ctx = await requireUser();
  const parsed = targetSchema.safeParse({ userId: form.get("userId") });
  if (!parsed.success) return;
  const target = await manageable(ctx, parsed.data.userId);
  if (!target) return;
  const reset = afterAdminUnlock();
  await adminClient()
    .from("app_user")
    .update({
      failed_login_count: reset.failedLoginCount,
      locked_until: null,
      lock_count: reset.lockCount,
    })
    .eq("id", target.id);
  await recordAuthEvent("unlocked", {
    facilityId: target.facility.id,
    userId: target.id,
    actorId: ctx.userId,
  });
  revalidatePath("/accounts");
}

/** パスワード再設定メールの送信（管理者は送るだけ。設定は本人が行う） */
export async function sendPasswordReset(form: FormData) {
  const ctx = await requireUser();
  const parsed = targetSchema.safeParse({ userId: form.get("userId") });
  if (!parsed.success) return;
  const target = await manageable(ctx, parsed.data.userId);
  if (!target) return;
  await adminClient().auth.resetPasswordForEmail(target.email, {
    redirectTo: `${serverEnv().APP_URL}/auth/confirm`,
  });
  await recordAuthEvent("password_reset_sent", {
    facilityId: target.facility.id,
    userId: target.id,
    actorId: ctx.userId,
  });
  revalidatePath("/accounts");
}

const facilitySchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{2,32}$/),
  name: z.string().trim().min(1).max(100),
  sub: z.string().trim().max(100),
});

/** 施設（クライアント）の追加。本部管理者だけ。本部管理者には自動で権限が付く。 */
export async function createFacility(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const hqId = await hqFacilityId();
  if (!actorRolesAt(ctx, hqId).includes("hq_admin"))
    return fail("施設を追加できるのは本部管理者だけです。");
  const parsed = facilitySchema.safeParse({
    code: form.get("code"),
    name: form.get("name"),
    sub: form.get("sub") ?? "",
  });
  if (!parsed.success)
    return fail("施設コード（半角英数字と _ -、2〜32文字）と施設名を入力してください。");

  const admin = adminClient();
  const { data: facility, error } = await admin
    .from("facility")
    .insert({
      code: parsed.data.code,
      name: parsed.data.name,
      sub: parsed.data.sub || null,
      kind: "venue",
    })
    .select("id")
    .single();
  if (error || !facility)
    return fail("追加できませんでした。同じ施設コードがないか確かめてください。");

  const { data: hqAdmins } = await admin
    .from("user_facility_role")
    .select("user_id")
    .eq("facility_id", hqId)
    .eq("role", "hq_admin");
  if (hqAdmins?.length) {
    await admin.from("user_facility_role").insert(
      hqAdmins.map((a) => ({
        user_id: a.user_id,
        facility_id: facility.id,
        role: "hq_admin" as const,
        created_by: ctx.userId,
      })),
    );
  }
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "施設を追加",
    targetType: "facility",
    targetId: facility.id,
    detail: { code: parsed.data.code },
  });
  revalidatePath("/accounts");
  return { ok: `${parsed.data.name} を追加しました。` };
}
