import { timingSafeEqual } from "node:crypto";
import { recentDays } from "@/lib/core/ga4/transform";
import { syncAllGa4 } from "@/lib/server/ga4/sync";

// 毎朝の GA4 自動取込（公開先の定期実行から呼ぶ）。秘密のトークンがないと何もしない。
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Not Found", { status: 404 });
  // GA4 は数日遅れて値が確定するので、毎日 直近3日を取り直す
  const results = await syncAllGa4(recentDays(new Date(), 3));
  const summary = results.map((r) => ({
    facility: r.facility,
    status: r.result.status,
    ...(r.result.status === "imported" ? { rows: r.result.rows } : {}),
  }));
  return Response.json({ ok: results.every((r) => r.result.status !== "error"), results: summary });
}
