// ログインのロック（仕様書10章・本番設計）：
// 5回続けて失敗で15分ロック。ロックを繰り返すと（3回目のロック）管理者が解除するまで入れない。

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
/** この回数目のロックからは、時間がたっても解除しない（管理者が解除する） */
export const LOCKS_BEFORE_ADMIN_UNLOCK = 3;

export type LockState = {
  failedLoginCount: number;
  lockedUntil: Date | null;
  lockCount: number;
};

/** 管理者の解除が必要なロックの印（無期限） */
export const LOCKED_UNTIL_ADMIN = new Date("9999-12-31T00:00:00Z");

export function isLocked(state: LockState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

export function needsAdminUnlock(state: LockState): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() >= LOCKED_UNTIL_ADMIN.getTime();
}

/** パスワードを間違えたあとの状態。ロック中の失敗は数えない（呼び出し側でロック中は先に断る）。 */
export function afterFailedLogin(state: LockState, now: Date): LockState & { lockedNow: boolean } {
  // 15分のロックが明けたあとは、失敗回数を数え直す（ロックの回数は残す）
  const lockExpired = state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime();
  const failed = lockExpired ? 1 : state.failedLoginCount + 1;
  if (failed < MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginCount: failed,
      lockedUntil: lockExpired ? null : state.lockedUntil,
      lockCount: state.lockCount,
      lockedNow: false,
    };
  }
  const lockCount = state.lockCount + 1;
  const lockedUntil =
    lockCount >= LOCKS_BEFORE_ADMIN_UNLOCK
      ? LOCKED_UNTIL_ADMIN
      : new Date(now.getTime() + LOCK_MINUTES * 60_000);
  return { failedLoginCount: 0, lockedUntil, lockCount, lockedNow: true };
}

/** ログインに成功したあとの状態 */
export function afterSuccessfulLogin(): LockState {
  return { failedLoginCount: 0, lockedUntil: null, lockCount: 0 };
}

/** 管理者がロックを解除したあとの状態 */
export function afterAdminUnlock(): LockState {
  return { failedLoginCount: 0, lockedUntil: null, lockCount: 0 };
}
