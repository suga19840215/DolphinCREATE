import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readServiceAccount, signAssertion } = await import("@/lib/server/ga4/client");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const sa = {
  client_email: "dolphin-create@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("GA4 サービスアカウント", () => {
  it("JSON でも base64 でも読める。形が違えば止める", () => {
    expect(readServiceAccount(JSON.stringify(sa)).client_email).toBe(sa.client_email);
    expect(
      readServiceAccount(Buffer.from(JSON.stringify(sa)).toString("base64")).client_email,
    ).toBe(sa.client_email);
    expect(() => readServiceAccount("{}")).toThrow(/形が違います/);
    expect(() => readServiceAccount("")).toThrow(/設定されていません/);
  });

  it("読み取り専用の範囲で、秘密鍵で正しく署名した要求を作る", () => {
    const jwt = signAssertion(
      sa,
      "https://oauth2.googleapis.com/token",
      Date.parse("2026-10-08T00:00:00Z"),
    );
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
    expect(claims).toMatchObject({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: claims.iat + 3600,
    });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true);
  });
});
