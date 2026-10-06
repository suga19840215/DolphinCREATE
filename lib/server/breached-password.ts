import "server-only";
import { createHash } from "node:crypto";

/**
 * 漏えい済みパスワードの一覧（Have I Been Pwned）と照合する（仕様書10章）。
 * パスワードそのものは送らず、SHA-1 の先頭5文字だけを送る方式（k-匿名性）。
 * 照合先に届かないときは "unknown" を返し、呼び出し側で扱いを決める。
 */
export async function isBreachedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | "unknown"> {
  if (process.env.BREACHED_PASSWORD_CHECK === "off") return false;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "dolphin-create" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return "unknown";
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return "unknown";
  }
}
