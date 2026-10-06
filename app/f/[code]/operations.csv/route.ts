import { toCsv } from "@/lib/core/csv";
import { recordOperation } from "@/lib/server/audit";
import { getSession, selectableFacilities } from "@/lib/server/session";
import { userClient } from "@/lib/server/supabase";

// 操作の記録の CSV。選んだ施設の行だけ（受入テスト2）。
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getSession();
  if (!ctx || ctx === "expired" || !ctx.mfaSatisfied)
    return new Response("Not Found", { status: 404 });
  const facility = selectableFacilities(ctx).find((f) => f.code === code);
  if (!facility) return new Response("Not Found", { status: 404 });

  const supabase = await userClient();
  const { data, error } = await supabase
    .from("operation_log")
    .select("facility_id, at, action, target_type, target_id, actor:actor_id (display_name)")
    .eq("facility_id", facility.id)
    .order("at", { ascending: false })
    .limit(10_000);
  if (error) return new Response("Not Found", { status: 404 });

  const rows = [
    ["施設コード", "日時（JST）", "実行者", "操作", "対象", "対象ID"],
    ...(data ?? [])
      .filter((r) => r.facility_id === facility.id)
      .map((r) => [
        facility.code,
        new Date(r.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
        r.actor?.display_name ?? "",
        r.action,
        r.target_type ?? "",
        r.target_id ?? "",
      ]),
  ];
  await recordOperation({
    facilityId: facility.id,
    actorId: ctx.userId,
    action: "操作の記録をCSVで書き出し",
  });
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="operations_${facility.code}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
