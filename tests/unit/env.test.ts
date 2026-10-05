import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseServerEnv } = await import("@/lib/server/env");

describe("parseServerEnv", () => {
  it("最低限の値で読める（任意の秘密は空なら undefined）", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      ANTHROPIC_API_KEY: "",
    });
    expect(env.APP_ENV).toBe("development");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("足りない値は名前だけを示し、値は出さない", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        SUPABASE_SERVICE_ROLE_KEY: "s3cr3t",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    try {
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "s3cr3t" });
    } catch (e) {
      expect(String(e)).not.toContain("s3cr3t");
    }
  });

  it("APP_ENV は決まった値だけ", () => {
    expect(() =>
      parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost", APP_ENV: "staging" }),
    ).toThrow(/APP_ENV/);
  });
});
