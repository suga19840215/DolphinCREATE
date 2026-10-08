import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { decryptSecret, encryptSecret } = await import("@/lib/server/crypto");

const k = randomBytes(32).toString("base64");

describe("接続情報の暗号化", () => {
  it("暗号化して元に戻せる。同じ値でも毎回違う暗号になる", () => {
    const a = encryptSecret("token-123", k);
    expect(a).not.toContain("token-123");
    expect(a).not.toBe(encryptSecret("token-123", k));
    expect(decryptSecret(a, k)).toBe("token-123");
  });
  it("鍵が違う・改ざんされていると戻せない", () => {
    const a = encryptSecret("token-123", k);
    expect(() => decryptSecret(a, randomBytes(32).toString("base64"))).toThrow();
    const parts = a.split(".");
    parts[3] = Buffer.from("xxxx").toString("base64");
    expect(() => decryptSecret(parts.join("."), k)).toThrow();
  });
  it("鍵の長さが違えば止める", () =>
    expect(() => encryptSecret("x", "short")).toThrow(/32 バイト/));
});
