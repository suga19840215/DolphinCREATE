import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canApprove,
  canManageAccounts,
  canManageUser,
  canSetBudgetCap,
  canTakeApprovalSlot,
  requiresMfa,
} from "@/lib/core/permissions";

describe("権限ごとにできること（仕様書3章）", () => {
  it("承認欄：データ＝Aさん、表現＝Bさん、会場＝施設管理者・会場担当", () => {
    expect(canApprove(["marketing"], "data")).toBe(true);
    expect(canApprove(["creative"], "expression")).toBe(true);
    expect(canApprove(["venue_staff"], "venue")).toBe(true);
    expect(canApprove(["facility_admin"], "venue")).toBe(true);
    expect(canApprove(["marketing"], "venue")).toBe(false);
  });

  it("本部管理者と閲覧のみは承認しない", () => {
    for (const slot of ["data", "expression", "venue"] as const) {
      expect(canApprove(["hq_admin"], slot)).toBe(false);
      expect(canApprove(["viewer"], slot)).toBe(false);
    }
  });

  it("月間予算上限の設定は施設管理者だけ", () => {
    expect(canSetBudgetCap(["facility_admin"])).toBe(true);
    expect(canSetBudgetCap(["venue_staff"])).toBe(false);
    expect(canSetBudgetCap(["hq_admin"])).toBe(false);
  });

  it("アカウント管理は本部管理者と施設管理者", () => {
    expect(canManageAccounts(["hq_admin"])).toBe(true);
    expect(canManageAccounts(["facility_admin"])).toBe(true);
    expect(canManageAccounts(["marketing"])).toBe(false);
  });

  it("施設管理者が発行できるのは自施設の会場担当・閲覧のみ", () => {
    expect(assignableRoles(["facility_admin"], "venue")).toEqual(["venue_staff", "viewer"]);
    expect(assignableRoles(["facility_admin"], "hq")).toEqual([]);
    expect(assignableRoles(["hq_admin"], "venue")).toContain("facility_admin");
    expect(assignableRoles(["hq_admin"], "hq")).toEqual(["hq_admin", "marketing", "creative"]);
    expect(canManageUser(["facility_admin"], ["facility_admin"])).toBe(false);
    expect(canManageUser(["facility_admin"], ["venue_staff"])).toBe(true);
  });

  it("多要素認証は本部管理者・施設管理者で必須", () => {
    expect(requiresMfa(["hq_admin"])).toBe(true);
    expect(requiresMfa(["facility_admin", "venue_staff"])).toBe(true);
    expect(requiresMfa(["marketing"])).toBe(false);
  });

  it("同じ人は承認欄を2つ以上取れない", () => {
    expect(canTakeApprovalSlot("data", [])).toBe(true);
    expect(canTakeApprovalSlot("data", ["data"])).toBe(true);
    expect(canTakeApprovalSlot("venue", ["data"])).toBe(false);
  });
});

import { canImport } from "@/lib/core/permissions";

describe("取込の権限", () => {
  it("データの取込は Aさん・施設管理者", () => {
    expect(canImport(["marketing"], "crm")).toBe(true);
    expect(canImport(["facility_admin"], "ads")).toBe(true);
    expect(canImport(["creative"], "crm")).toBe(false);
    expect(canImport(["venue_staff"], "consultation")).toBe(false);
    expect(canImport(["hq_admin"], "consultation")).toBe(false);
  });
  it("生成画像は Bさんも取り込める", () => {
    expect(canImport(["creative"], "images")).toBe(true);
    expect(canImport(["viewer"], "images")).toBe(false);
  });
});
