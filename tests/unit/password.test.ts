import { describe, expect, it } from "vitest";
import { checkPassword } from "@/lib/core/password";

describe("パスワードの決まり", () => {
  it("12文字未満は不可", () =>
    expect(checkPassword("abcdefghijk", "abcdefghijk")).toBe("too_short"));
  it("12文字以上なら可（英数字の組み合わせは問わない）", () =>
    expect(checkPassword("correct horse", "correct horse")).toBeNull());
  it("確認用と違えば不可", () =>
    expect(checkPassword("abcdefghijkl", "abcdefghijkm")).toBe("mismatch"));
  it("メールアドレスの名前部分を含むと不可", () =>
    expect(checkPassword("suzuki-2026-wedding", "suzuki-2026-wedding", "suzuki@example.jp")).toBe(
      "contains_email",
    ));
  it("全角文字も1文字として数える", () =>
    expect(checkPassword("海の見えるチャペルで結婚式", "海の見えるチャペルで結婚式")).toBeNull());
});
