import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isBreachedPassword } = await import("@/lib/server/breached-password");

const suffixOf = (pw: string) => createHash("sha1").update(pw).digest("hex").toUpperCase().slice(5);
const fakeFetch = (body: string, ok = true) =>
  vi.fn(async (url: string) => {
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/); // 先頭5文字だけを送る
    return new Response(body, { status: ok ? 200 : 503 });
  }) as unknown as typeof fetch;

describe("漏えい済みパスワードの照合", () => {
  it("一覧にあれば true", async () => {
    const pw = "password1234";
    expect(await isBreachedPassword(pw, fakeFetch(`${suffixOf(pw)}:42\r\nABC:1`))).toBe(true);
  });
  it("一覧になければ false（padding の 0 件は数えない）", async () => {
    const pw = "海の見えるチャペル2026秋";
    expect(await isBreachedPassword(pw, fakeFetch(`${suffixOf(pw)}:0\r\nABC:3`))).toBe(false);
  });
  it("照合先に届かなければ unknown", async () => {
    expect(await isBreachedPassword("whatever-pass", fakeFetch("", false))).toBe("unknown");
  });
});
