import { describe, expect, it } from "vitest";
import {
  LOCKED_UNTIL_ADMIN,
  afterFailedLogin,
  isLocked,
  needsAdminUnlock,
  type LockState,
} from "@/lib/core/lockout";

const t0 = new Date("2026-10-06T00:00:00Z");
const fresh: LockState = { failedLoginCount: 0, lockedUntil: null, lockCount: 0 };
const fail = (s: LockState, at: Date, times: number) => {
  let x = s;
  for (let i = 0; i < times; i++) x = afterFailedLogin(x, at);
  return x;
};

describe("ログインのロック", () => {
  it("4回までは失敗回数を数えるだけ", () => {
    const s = fail(fresh, t0, 4);
    expect(s.failedLoginCount).toBe(4);
    expect(isLocked(s, t0)).toBe(false);
  });

  it("5回続けて失敗で15分ロック", () => {
    const s = fail(fresh, t0, 5);
    expect(isLocked(s, t0)).toBe(true);
    expect(isLocked(s, new Date(t0.getTime() + 14 * 60_000))).toBe(true);
    expect(isLocked(s, new Date(t0.getTime() + 15 * 60_000))).toBe(false);
    expect(s.lockCount).toBe(1);
  });

  it("ロックが明けたら失敗回数を数え直す", () => {
    const later = new Date(t0.getTime() + 16 * 60_000);
    const s = afterFailedLogin(fail(fresh, t0, 5), later);
    expect(s.failedLoginCount).toBe(1);
    expect(isLocked(s, later)).toBe(false);
  });

  it("ロックを繰り返すと（3回目）管理者が解除するまで入れない", () => {
    let s = fresh;
    let now = t0;
    for (let i = 0; i < 3; i++) {
      s = fail(s, now, 5);
      now = new Date(now.getTime() + 16 * 60_000);
    }
    expect(s.lockedUntil).toEqual(LOCKED_UNTIL_ADMIN);
    expect(needsAdminUnlock(s)).toBe(true);
    expect(isLocked(s, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});
