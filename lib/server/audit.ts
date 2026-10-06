import "server-only";
import { headers } from "next/headers";
import type { Database, Json } from "./database.types";
import { adminClient } from "./supabase";

export type AuthEvent = Database["public"]["Tables"]["auth_audit"]["Insert"]["event"];

async function requestInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  return { ip, user_agent: h.get("user-agent")?.slice(0, 300) ?? null };
}

let hqIdCache: string | undefined;

/** 本部（HQ）の施設ID。所属の分からない記録（存在しないメールでの失敗など）は本部に付ける。 */
export async function hqFacilityId(): Promise<string> {
  if (hqIdCache) return hqIdCache;
  const { data, error } = await adminClient()
    .from("facility")
    .select("id")
    .eq("kind", "hq")
    .single();
  if (error || !data) throw new Error("本部（HQ）の施設が登録されていません");
  hqIdCache = data.id;
  return data.id;
}

/** ログイン履歴に残す（成功・失敗・ロック・権限変更など。1年保存）。 */
export async function recordAuthEvent(
  event: AuthEvent,
  opts: {
    facilityId?: string | null;
    userId?: string | null;
    actorId?: string | null;
    email?: string | null;
    detail?: Json;
  } = {},
) {
  const info = await requestInfo();
  const { error } = await adminClient()
    .from("auth_audit")
    .insert({
      event,
      facility_id: opts.facilityId ?? (await hqFacilityId()),
      user_id: opts.userId ?? null,
      actor_id: opts.actorId ?? null,
      email_entered: opts.email ?? null,
      detail: opts.detail ?? {},
      ...info,
    });
  if (error) throw new Error(`ログイン履歴を記録できませんでした: ${error.message}`);
}

/** 操作の記録に残す（承認・入稿・書き出し・設定変更など）。 */
export async function recordOperation(opts: {
  facilityId: string;
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Json;
}) {
  const { error } = await adminClient()
    .from("operation_log")
    .insert({
      facility_id: opts.facilityId,
      actor_id: opts.actorId,
      action: opts.action,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      detail: opts.detail ?? {},
    });
  if (error) throw new Error(`操作の記録に失敗しました: ${error.message}`);
}
