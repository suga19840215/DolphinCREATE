import "server-only";
import { createSign } from "node:crypto";
import { z } from "zod";
import type { Report } from "@/lib/core/ga4/transform";

// GA4 Data API（読み取りだけ）。会社で1つのサービスアカウントを、各会場の GA4 プロパティに「閲覧者」で追加して使う。
// 鍵は環境変数 GA4_SERVICE_ACCOUNT_JSON（JSON そのもの、または base64）。リポジトリには入れない。

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const keySchema = z.object({
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
  token_uri: z.url().optional(),
});
export type ServiceAccount = z.infer<typeof keySchema>;

export class Ga4Error extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "permission" | "not_found" | "quota" | "other",
  ) {
    super(message);
  }
}

export function readServiceAccount(raw = process.env.GA4_SERVICE_ACCOUNT_JSON): ServiceAccount {
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON が設定されていません");
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try {
    return keySchema.parse(JSON.parse(text));
  } catch {
    throw new Error(
      "GA4_SERVICE_ACCOUNT_JSON の形が違います（サービスアカウントの JSON キーを入れてください）",
    );
  }
}

/** テストでだけ、偽の GA4 サーバーへ向ける（本番では使わない） */
function endpoints() {
  const prod = process.env.APP_ENV === "production";
  return {
    api: (!prod && process.env.GA4_API_BASE) || "https://analyticsdata.googleapis.com",
    token: (!prod && process.env.GOOGLE_TOKEN_URL) || "https://oauth2.googleapis.com/token",
  };
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** サービスアカウントで署名した要求（JWT）を作る */
export function signAssertion(sa: ServiceAccount, audience: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: audience, iat, exp: iat + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
}

let cached: { token: string; until: number; email: string } | undefined;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.until > Date.now() + 60_000)
    return cached.token;
  const url = endpoints().token;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(sa, url),
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GA4 の認証に失敗しました（${res.status}）`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("GA4 の認証に失敗しました（トークンなし）");
  cached = {
    token: body.access_token,
    until: Date.now() + (body.expires_in ?? 3600) * 1000,
    email: sa.client_email,
  };
  return body.access_token;
}

export type RunReportRequest = {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
};

/** runReport を、全行そろうまでページを送って呼ぶ */
export async function runReport(
  propertyId: string,
  req: RunReportRequest,
  sa = readServiceAccount(),
): Promise<Report> {
  const token = await accessToken(sa);
  const url = `${endpoints().api}/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
  const rows: NonNullable<Report["rows"]> = [];
  const pageSize = 50_000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, limit: pageSize, offset }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const kind =
        res.status === 403
          ? "permission"
          : res.status === 404
            ? "not_found"
            : res.status === 429
              ? "quota"
              : res.status === 401
                ? "auth"
                : "other";
      const message = {
        permission:
          "この GA4 プロパティを見る権限がありません。サービスアカウントを「閲覧者」として追加してください。",
        not_found: "GA4 プロパティが見つかりません。プロパティ ID を確かめてください。",
        quota: "GA4 の利用回数の上限に達しました。時間をおいて再実行します。",
        auth: "GA4 の認証に失敗しました。サービスアカウントの鍵を確かめてください。",
        other: `GA4 から取得できませんでした（${res.status}）。`,
      }[kind];
      throw new Ga4Error(message, kind);
    }
    const page = (await res.json()) as Report;
    rows.push(...(page.rows ?? []));
    if (!page.rowCount || rows.length >= page.rowCount || !(page.rows ?? []).length) break;
  }
  return { rows, rowCount: rows.length };
}
