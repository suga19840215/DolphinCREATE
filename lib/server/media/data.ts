import "server-only";
import { mainCustomer, type Consultation, type MainCustomer } from "@/lib/core/media/match";
import { matchOutlet, type OutletCode } from "@/lib/core/media/outlets";
import type { AreaRow, ResultRow } from "@/lib/core/media/evaluate";
import type { userClient } from "../supabase";

type Client = Awaited<ReturnType<typeof userClient>>;

export async function loadMediaData(supabase: Client, facilityId: string) {
  const [results, areas, ads, docs] = await Promise.all([
    supabase
      .from("media_result")
      .select("month, outlet, menu, cost_yen, visits, contracts, target_visits")
      .eq("facility_id", facilityId)
      .order("month"),
    supabase
      .from("media_area_benchmark")
      .select("month, area, outlet, avg_visits, avg_contracts")
      .eq("facility_id", facilityId)
      .order("month"),
    supabase
      .from("media_top_ad")
      .select("outlet, catch_text, visual_path, visual_axes, catch_axes, updated_at")
      .eq("facility_id", facilityId),
    supabase
      .from("media_doc")
      .select(
        "id, file_name, status, method, draft, message, created_at, confirmed_at, uploader:uploaded_by (display_name)",
      )
      .eq("facility_id", facilityId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  return {
    results: (results.data ?? []).map((r) => ({
      ...r,
      cost_yen: r.cost_yen === null ? null : Number(r.cost_yen),
    })) as ResultRow[],
    areas: (areas.data ?? []).map((a) => ({
      ...a,
      avg_visits: a.avg_visits === null ? null : Number(a.avg_visits),
      avg_contracts: a.avg_contracts === null ? null : Number(a.avg_contracts),
    })) as AreaRow[],
    ads: ads.data ?? [],
    docs: docs.data ?? [],
  };
}

/**
 * 媒体ごとの来館メイン顧客（Dolphin の接客で、流入元がその媒体のもの）。
 * 重視点・好まれる画像・決め手・来館動機の言葉を訴求軸に当てはめる。AI には渡さない（集計値だけを渡す）。
 */
export async function loadMainCustomers(
  supabase: Client,
  facilityId: string,
  range: { from: string; to: string },
): Promise<Partial<Record<OutletCode, MainCustomer>>> {
  const { data: sessions } = await supabase
    .from("consultation_session")
    .select("id, source, cluster_code, age_band, area_band, visit_motive, decision_factor")
    .eq("facility_id", facilityId)
    .gte("consulted_at", range.from)
    .lt("consulted_at", range.to)
    .limit(5000);
  const list = (sessions ?? [])
    .map((s) => ({ ...s, outlet: matchOutlet(s.source) }))
    .filter((s) => s.outlet);
  if (!list.length) return {};
  const labels = new Map<string, string[]>();
  const ids = list.map((s) => s.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("customer_insight")
      .select("consultation_id, label")
      .eq("facility_id", facilityId)
      .in("consultation_id", ids.slice(i, i + 500))
      .in("kind", ["priority", "visual_preference", "decision_factor", "visit_motive"]);
    for (const x of data ?? [])
      (
        labels.get(x.consultation_id) ?? labels.set(x.consultation_id, []).get(x.consultation_id)!
      ).push(x.label);
  }
  const by = new Map<OutletCode, Consultation[]>();
  for (const s of list) {
    const c: Consultation = {
      cluster_code: s.cluster_code,
      age_band: s.age_band,
      area_band: s.area_band,
      insightLabels: [
        ...(labels.get(s.id) ?? []),
        s.visit_motive ?? "",
        s.decision_factor ?? "",
      ].filter(Boolean),
    };
    (by.get(s.outlet!) ?? by.set(s.outlet!, []).get(s.outlet!)!).push(c);
  }
  return Object.fromEntries([...by].map(([o, l]) => [o, mainCustomer(l)]));
}
