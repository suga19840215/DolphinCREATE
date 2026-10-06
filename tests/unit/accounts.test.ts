import { describe, expect, it } from "vitest";
import { buildRoleRows, isInactiveCandidate } from "@/lib/core/accounts";

const hq = { id: "hq", kind: "hq" as const };
const a = { id: "A", kind: "venue" as const };

describe("buildRoleRows", () => {
  it("施設所属：自施設だけに付く", () => {
    expect(
      buildRoleRows({
        homeFacility: a,
        roles: ["venue_staff"],
        assignedVenueIds: ["B"],
        allVenueIds: ["A", "B"],
      }),
    ).toEqual([{ facilityId: "A", role: "venue_staff" }]);
  });
  it("施設所属に本部の権限は付けられない", () => {
    expect(() =>
      buildRoleRows({
        homeFacility: a,
        roles: ["hq_admin"],
        assignedVenueIds: [],
        allVenueIds: ["A"],
      }),
    ).toThrow();
  });
  it("本部管理者は本部と全施設", () => {
    expect(
      buildRoleRows({
        homeFacility: hq,
        roles: ["hq_admin"],
        assignedVenueIds: [],
        allVenueIds: ["A", "B"],
      }),
    ).toEqual([
      { facilityId: "hq", role: "hq_admin" },
      { facilityId: "A", role: "hq_admin" },
      { facilityId: "B", role: "hq_admin" },
    ]);
  });
  it("Aさん・Bさんは担当する施設だけ", () => {
    expect(
      buildRoleRows({
        homeFacility: hq,
        roles: ["marketing"],
        assignedVenueIds: ["B"],
        allVenueIds: ["A", "B"],
      }),
    ).toEqual([{ facilityId: "B", role: "marketing" }]);
  });
  it("知らない施設は担当にできない", () => {
    expect(() =>
      buildRoleRows({
        homeFacility: hq,
        roles: ["creative"],
        assignedVenueIds: ["Z"],
        allVenueIds: ["A"],
      }),
    ).toThrow();
  });
});

describe("isInactiveCandidate", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  it("最終ログインから90日を超えると停止候補", () => {
    expect(isInactiveCandidate("2026-07-01T00:00:00Z", "2026-01-01T00:00:00Z", now)).toBe(true);
    expect(isInactiveCandidate("2026-09-01T00:00:00Z", "2026-01-01T00:00:00Z", now)).toBe(false);
  });
  it("一度もログインしていなければ作成日から数える", () => {
    expect(isInactiveCandidate(null, "2026-09-30T00:00:00Z", now)).toBe(false);
  });
});
