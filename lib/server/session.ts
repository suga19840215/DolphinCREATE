import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { isRole, requiresMfa, type Role } from "@/lib/core/permissions";
import { recordAuthEvent } from "./audit";
import { adminClient, userClient } from "./supabase";

export type FacilitySummary = {
  id: string;
  code: string;
  name: string;
  sub: string | null;
  kind: "hq" | "venue";
};

export type SessionContext = {
  userId: string;
  email: string;
  displayName: string;
  homeFacility: FacilitySummary;
  aal: "aal1" | "aal2";
  /** 施設ごとの権限（サーバーが信頼できる経路で読んだもの） */
  rolesByFacility: Map<string, { facility: FacilitySummary; roles: Role[] }>;
  allRoles: Role[];
  mfaSatisfied: boolean;
};

type Claims = { sub: string; session_id?: string; aal?: string; email?: string };

async function readClaims(): Promise<Claims | null> {
  const supabase = await userClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims as Claims;
}

/**
 * ログイン中の人の情報。セッションが切れていれば "expired"、ログインしていなければ null。
 * 1回の表示の中では何度呼んでも1回だけ問い合わせる。
 */
export const getSession = cache(async (): Promise<SessionContext | "expired" | null> => {
  const claims = await readClaims();
  if (!claims) return null;

  // 最終操作時刻を更新しつつ、無操作30分・最長12時間・停止を確かめる（DB 側の判定）
  const supabase = await userClient();
  const { data: alive, error } = await supabase.rpc("touch_session");
  if (error || alive !== true) return "expired";

  const admin = adminClient();
  const { data: user } = await admin
    .from("app_user")
    .select("id, email, display_name, status, facility:facility_id (id, code, name, sub, kind)")
    .eq("id", claims.sub)
    .single();
  if (!user || user.status !== "active" || !user.facility) return "expired";

  const { data: roleRows } = await admin
    .from("user_facility_role")
    .select("role, facility:facility_id (id, code, name, sub, kind)")
    .eq("user_id", claims.sub);

  const rolesByFacility: SessionContext["rolesByFacility"] = new Map();
  for (const row of roleRows ?? []) {
    if (!row.facility || !isRole(row.role)) continue;
    const entry = rolesByFacility.get(row.facility.id) ?? { facility: row.facility, roles: [] };
    entry.roles.push(row.role);
    rolesByFacility.set(row.facility.id, entry);
  }
  const allRoles = [...new Set([...rolesByFacility.values()].flatMap((e) => e.roles))];
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";

  return {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    homeFacility: user.facility,
    aal,
    rolesByFacility,
    allRoles,
    mfaSatisfied: !requiresMfa(allRoles) || aal === "aal2",
  };
});

/** セッションが切れたときの後始末。履歴に残してサインアウトする。 */
export async function endExpiredSession(): Promise<never> {
  const claims = await readClaims();
  const supabase = await userClient();
  await supabase.auth.signOut({ scope: "local" });
  if (claims?.sub) {
    const { data } = await adminClient()
      .from("app_user")
      .select("facility_id")
      .eq("id", claims.sub)
      .maybeSingle();
    await recordAuthEvent("auto_logout", {
      userId: claims.sub,
      facilityId: data?.facility_id ?? null,
    });
  }
  redirect("/login?reason=expired");
}

/** ログインと多要素認証を済ませた人だけを通す。 */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSession();
  if (ctx === null) redirect("/login");
  if (ctx === "expired") return endExpiredSession();
  if (!ctx.mfaSatisfied) redirect("/mfa");
  return ctx;
}

/** 施設の選択肢（会場だけ。本部は選択肢に出さない） */
export function selectableFacilities(ctx: SessionContext): FacilitySummary[] {
  return [...ctx.rolesByFacility.values()]
    .map((e) => e.facility)
    .filter((f) => f.kind === "venue")
    .sort((a, b) => a.code.localeCompare(b.code, "ja"));
}

/**
 * 施設コードから施設を開く。見られない施設は「存在しない」として 404（本番設計）。
 * サーバーの権限表と、DB の行ごとのアクセス制限の両方で確かめる。
 */
export async function requireFacility(code: string) {
  const ctx = await requireUser();
  const entry = [...ctx.rolesByFacility.values()].find(
    (e) => e.facility.code === code && e.facility.kind === "venue",
  );
  if (!entry) notFound();

  const supabase = await userClient();
  const { data: facility } = await supabase
    .from("facility")
    .select(
      "id, code, name, sub, kind, region, lp_domain, fee_rate_bp, monthly_budget_cap_yen, min_n, updated_at",
    )
    .eq("code", code)
    .maybeSingle();
  if (!facility || facility.id !== entry.facility.id) notFound();

  return { ctx, facility, roles: entry.roles };
}
