// パスワードの決まり（仕様書10章・本番設計）：12文字以上。漏えい済みパスワードは別途サーバーで照合する。

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = "too_short" | "too_long" | "contains_email" | "mismatch";

export const PASSWORD_PROBLEM_MESSAGE: Record<PasswordProblem | "breached", string> = {
  too_short: `${PASSWORD_MIN_LENGTH}文字以上にしてください。`,
  too_long: `${PASSWORD_MAX_LENGTH}文字以内にしてください。`,
  contains_email: "メールアドレスを含まないパスワードにしてください。",
  mismatch: "確認のために入力したパスワードが一致しません。",
  breached:
    "このパスワードは過去に漏えいしたパスワードの一覧に含まれています。別のパスワードにしてください。",
};

export function checkPassword(
  password: string,
  confirm: string,
  email?: string,
): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) return "too_short";
  if (length > PASSWORD_MAX_LENGTH) return "too_long";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "contains_email";
  if (password !== confirm) return "mismatch";
  return null;
}
