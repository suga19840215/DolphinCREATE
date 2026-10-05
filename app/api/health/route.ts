// 稼働確認用。秘密情報や設定値は返さない。
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
