import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 接続情報（広告・GA4・Dolphin のトークンなど）を施設ごとに暗号化して保管する（仕様書10章）。
// AES-256-GCM。鍵は環境変数 CONNECTION_ENCRYPTION_KEY（32バイトを base64）。

function key(raw: string | undefined): Buffer {
  const k = Buffer.from(raw ?? "", "base64");
  if (k.length !== 32)
    throw new Error("CONNECTION_ENCRYPTION_KEY は 32 バイトを base64 にした値にしてください");
  return k;
}

/** 暗号化した文字列（v1.iv.tag.本体、いずれも base64） */
export function encryptSecret(
  plain: string,
  rawKey = process.env.CONNECTION_ENCRYPTION_KEY,
): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64"),
    c.getAuthTag().toString("base64"),
    body.toString("base64"),
  ].join(".");
}

export function decryptSecret(
  sealed: string,
  rawKey = process.env.CONNECTION_ENCRYPTION_KEY,
): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("暗号化された値の形が違います");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}
