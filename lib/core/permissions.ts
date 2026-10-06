// 権限ごとにできること（仕様書3章・本番設計「アカウントと権限」）。
// 画面のボタンの出し分けと、サーバー側の可否判定の両方がここを使う（受入テスト7）。
// データベースの行ごとのアクセス制限（supabase/migrations）も同じ表に合わせてある。

export const ROLES = [
  "hq_admin",
  "marketing",
  "creative",
  "facility_admin",
  "venue_staff",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  hq_admin: "本部管理者",
  marketing: "マーケ・データ（Aさん）",
  creative: "制作・ブランド（Bさん）",
  facility_admin: "施設管理者",
  venue_staff: "会場担当",
  viewer: "閲覧のみ",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  hq_admin: "全施設の閲覧・アカウント管理。承認はしない",
  marketing: "担当施設の閲覧、データ・計測の承認",
  creative: "担当施設の閲覧、表現・ブランドの承認、素材の権利確認",
  facility_admin:
    "自施設の閲覧、事実・素材・予算の承認、月間予算上限の設定、自施設の担当者の発行・停止",
  venue_staff: "自施設の閲覧、事実・素材・予算の承認",
  viewer: "自施設の閲覧のみ",
};

/** 本部に所属するアカウントが持てる権限 */
export const HQ_ROLES: readonly Role[] = ["hq_admin", "marketing", "creative"];
/** 施設に所属するアカウントが持てる権限 */
export const VENUE_ROLES: readonly Role[] = ["facility_admin", "venue_staff", "viewer"];

/** 多要素認証が必須の権限（本番設計：本部管理者・施設管理者） */
export const MFA_REQUIRED_ROLES: readonly Role[] = ["hq_admin", "facility_admin"];

/** 3者承認の欄 */
export type ApprovalSlot = "data" | "expression" | "venue";

export const APPROVAL_SLOT_LABEL: Record<ApprovalSlot, string> = {
  data: "データ・計測",
  expression: "表現・ブランド",
  venue: "会場（事実・素材・予算）",
};

const has = (roles: readonly Role[], ...wanted: Role[]) => roles.some((r) => wanted.includes(r));

export function requiresMfa(roles: readonly Role[]): boolean {
  return has(roles, ...MFA_REQUIRED_ROLES);
}

/** その施設で、どの承認欄を承認できるか */
export function canApprove(rolesAtFacility: readonly Role[], slot: ApprovalSlot): boolean {
  switch (slot) {
    case "data":
      return has(rolesAtFacility, "marketing");
    case "expression":
      return has(rolesAtFacility, "creative");
    case "venue":
      return has(rolesAtFacility, "facility_admin", "venue_staff");
  }
}

/** 月間予算上限の設定（仕様書3章：施設管理者） */
export function canSetBudgetCap(rolesAtFacility: readonly Role[]): boolean {
  return has(rolesAtFacility, "facility_admin");
}

/** アカウント管理の画面を開けるか */
export function canManageAccounts(rolesAtFacility: readonly Role[]): boolean {
  return has(rolesAtFacility, "hq_admin", "facility_admin");
}

/** 取込・作成など、データを変える操作ができるか（閲覧のみ以外） */
export function canEdit(rolesAtFacility: readonly Role[]): boolean {
  return has(rolesAtFacility, "marketing", "creative", "facility_admin", "venue_staff");
}

/**
 * 発行・変更できる権限。
 * - 本部管理者：すべて（本部所属なら本部の権限、施設所属なら施設の権限）
 * - 施設管理者：自施設の会場担当・閲覧のみだけ（施設管理者の発行は本部が行う）
 */
export function assignableRoles(
  actorRolesAtTarget: readonly Role[],
  targetFacilityKind: "hq" | "venue",
): Role[] {
  if (has(actorRolesAtTarget, "hq_admin")) {
    return targetFacilityKind === "hq" ? [...HQ_ROLES] : [...VENUE_ROLES];
  }
  if (targetFacilityKind === "venue" && has(actorRolesAtTarget, "facility_admin")) {
    return ["venue_staff", "viewer"];
  }
  return [];
}

/** 停止・再開・ロック解除・再設定メールを、その利用者に対して行えるか */
export function canManageUser(
  actorRolesAtTarget: readonly Role[],
  targetRoles: readonly Role[],
): boolean {
  if (has(actorRolesAtTarget, "hq_admin")) return true;
  if (has(actorRolesAtTarget, "facility_admin")) {
    // 施設管理者は、会場担当・閲覧のみの人だけを扱える
    return targetRoles.every((r) => r === "venue_staff" || r === "viewer");
  }
  return false;
}

/** 1人が承認欄の2つ以上を承認しないように：すでに承認した欄があれば、ほかの欄は承認できない */
export function canTakeApprovalSlot(
  slot: ApprovalSlot,
  slotsAlreadyApprovedByThisUser: readonly ApprovalSlot[],
): boolean {
  return slotsAlreadyApprovedByThisUser.every((s) => s === slot);
}

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}
