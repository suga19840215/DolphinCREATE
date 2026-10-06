import { NextResponse, type NextRequest } from "next/server";
import { appConfig } from "@/config/app";
import { getSession, selectableFacilities } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

// 施設のファイル（画像など）を表示するための、期限付きの署名URLを発行する。
// 他施設のファイルは「存在しない」として 404（受入テスト3）。DB 側でも Storage の制限で拒否される。
const notFound = () => NextResponse.json({ error: "見つかりません" }, { status: 404 });

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getSession();
  if (!ctx || ctx === "expired" || !ctx.mfaSatisfied) return notFound();
  const facility = selectableFacilities(ctx).find((f) => f.code === code);
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!facility || !path.startsWith(`${facility.id}/`) || path.includes("..")) return notFound();

  const supabase = await userClient();
  const { data, error } = await supabase.storage
    .from("facility-files")
    .createSignedUrl(path, appConfig.signedUrlTtlSeconds);
  if (error || !data) return notFound();
  return NextResponse.json({ url: data.signedUrl, expiresIn: appConfig.signedUrlTtlSeconds });
}
