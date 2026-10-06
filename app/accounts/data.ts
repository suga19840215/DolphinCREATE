import "server-only";
import { notFound } from "next/navigation";
import { assignableRoles, canManageAccounts, isRole, type Role } from "@/lib/core/permissions";
import { requireUser, type SessionContext } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

export type ManagedFacility = {
  id: string;
  code: string;
  name: string;
  kind: "hq" | "venue";
  assignable: Role[];
};

/** アカウント管理を開ける人だけを通す（開けない人には画面が「存在しない」）。 */
export async function requireAccountManager(): Promise<{
  ctx: SessionContext;
  facilities: ManagedFacility[];
}> {
  const ctx = await requireUser();
  const facilities: ManagedFacility[] = [];
  for (const { facility, roles } of ctx.rolesByFacility.values()) {
    if (!canManageAccounts(roles)) continue;
    facilities.push({ ...facility, assignable: assignableRoles(roles, facility.kind) });
  }
  if (!facilities.length) notFound();
  facilities.sort((a, b) =>
    a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind === "hq" ? -1 : 1,
  );
  return { ctx, facilities };
}

/** 見られる範囲の利用者と権限（DB の行ごとのアクセス制限で絞られる） */
export async function loadAccounts() {
  const supabase = await userClient();
  const [{ data: users }, { data: roleRows }] = await Promise.all([
    supabase
      .from("app_user")
      .select(
        "id, email, display_name, status, locked_until, lock_count, failed_login_count, last_login_at, created_at, facility:facility_id (id, code, name, kind)",
      )
      .order("created_at"),
    supabase
      .from("user_facility_role")
      .select("user_id, role, facility:facility_id (id, code, name, kind)"),
  ]);
  const rolesOf = new Map<
    string,
    { role: Role; facility: { id: string; code: string; name: string; kind: string } }[]
  >();
  for (const r of roleRows ?? []) {
    if (!r.facility || !isRole(r.role)) continue;
    const list = rolesOf.get(r.user_id) ?? [];
    list.push({ role: r.role, facility: r.facility });
    rolesOf.set(r.user_id, list);
  }
  return (users ?? [])
    .filter((u) => u.facility)
    .map((u) => ({ ...u, facility: u.facility!, roles: rolesOf.get(u.id) ?? [] }));
}

export type AccountRow = Awaited<ReturnType<typeof loadAccounts>>[number];
