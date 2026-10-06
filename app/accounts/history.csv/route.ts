import { toCsv } from "@/lib/core/csv";
import { canManageAccounts } from "@/lib/core/permissions";
import { getSession } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

// ログイン履歴の CSV。見られる施設の行だけ（DB の行ごとのアクセス制限で絞られる。受入テスト2）。
export async function GET() {
  const ctx = await getSession();
  if (!ctx || ctx === "expired" || !ctx.mfaSatisfied)
    return new Response("Not Found", { status: 404 });
  const manageable = [...ctx.rolesByFacility.values()]
    .filter((e) => canManageAccounts(e.roles))
    .map((e) => e.facility.id);
  if (!manageable.length) return new Response("Not Found", { status: 404 });

  const supabase = await userClient();
  const { data } = await supabase
    .from("auth_audit")
    .select(
      "facility_id, at, event, email_entered, user:user_id (display_name, email), facility:facility_id (code)",
    )
    .in("facility_id", manageable)
    .order("at", { ascending: false })
    .limit(50_000);

  const rows = [
    ["施設コード", "日時（JST）", "氏名", "メールアドレス", "内容"],
    ...(data ?? []).map((h) => [
      h.facility?.code ?? "",
      new Date(h.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      h.user?.display_name ?? "",
      h.user?.email ?? h.email_entered ?? "",
      h.event,
    ]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="login_history.csv"',
      "Cache-Control": "no-store",
    },
  });
}
