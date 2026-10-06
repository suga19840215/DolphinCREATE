import { HQ_ROLES, VENUE_ROLES, type Role } from "./permissions";

export type RoleRow = { facilityId: string; role: Role };

/**
 * 画面で選んだ権限を、施設ごとの権限の行にする（user_facility_role）。
 * - 施設所属：選んだ権限を自施設に付ける（施設管理者・会場担当・閲覧のみ）
 * - 本部所属：本部管理者は本部＋全施設、Aさん・Bさんは担当する施設に付ける
 */
export function buildRoleRows(input: {
  homeFacility: { id: string; kind: "hq" | "venue" };
  roles: readonly Role[];
  assignedVenueIds: readonly string[];
  allVenueIds: readonly string[];
}): RoleRow[] {
  const { homeFacility, roles } = input;
  const rows: RoleRow[] = [];
  if (homeFacility.kind === "venue") {
    for (const role of roles) {
      if (!VENUE_ROLES.includes(role))
        throw new Error(`施設のアカウントに ${role} は付けられません`);
      rows.push({ facilityId: homeFacility.id, role });
    }
    return rows;
  }
  for (const role of roles) {
    if (!HQ_ROLES.includes(role)) throw new Error(`本部のアカウントに ${role} は付けられません`);
    if (role === "hq_admin") {
      rows.push({ facilityId: homeFacility.id, role });
      for (const id of input.allVenueIds) rows.push({ facilityId: id, role });
    } else {
      const known = new Set(input.allVenueIds);
      for (const id of input.assignedVenueIds) {
        if (!known.has(id)) throw new Error("担当する施設が正しくありません");
        rows.push({ facilityId: id, role });
      }
    }
  }
  return rows;
}

/** 90日使われていないアカウントは停止候補（本番設計「運用」） */
export const INACTIVE_DAYS = 90;

export function isInactiveCandidate(
  lastLoginAt: string | null,
  createdAt: string,
  now: Date,
): boolean {
  const base = new Date(lastLoginAt ?? createdAt).getTime();
  return now.getTime() - base > INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}
