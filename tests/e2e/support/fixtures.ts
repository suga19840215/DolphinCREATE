import { createClient } from "@supabase/supabase-js";
import { generateSync } from "otplib";
import type { Database } from "../../../lib/server/database.types";
import { E2E_PASSWORD, env } from "./env";

type Role = Database["app"]["Enums"]["role"];

export const admin = () =>
  createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const FACILITIES = [
  { code: "HQ", kind: "hq" as const, name: "本部", sub: null },
  { code: "fac_A", kind: "venue" as const, name: "会場A", sub: "海辺のチャペル" },
  { code: "fac_B", kind: "venue" as const, name: "会場B", sub: "庭園の邸宅" },
];

/** テスト用アカウント。home=所属、roles=[施設コード, 権限]、mfa=多要素認証を登録しておく */
export const USERS = {
  hq: {
    email: "hq@e2e.test",
    name: "本部 管理者",
    home: "HQ",
    roles: [
      ["HQ", "hq_admin"],
      ["fac_A", "hq_admin"],
      ["fac_B", "hq_admin"],
    ],
    mfa: true,
  },
  mkt: {
    email: "mkt@e2e.test",
    name: "Aさん",
    home: "HQ",
    roles: [
      ["fac_A", "marketing"],
      ["fac_B", "marketing"],
    ],
    mfa: false,
  },
  faA: {
    email: "fa-a@e2e.test",
    name: "会場A 施設管理者",
    home: "fac_A",
    roles: [["fac_A", "facility_admin"]],
    mfa: true,
  },
  staffA: {
    email: "staff-a@e2e.test",
    name: "会場A 担当",
    home: "fac_A",
    roles: [["fac_A", "venue_staff"]],
    mfa: false,
  },
  staffB: {
    email: "staff-b@e2e.test",
    name: "会場B 担当",
    home: "fac_B",
    roles: [["fac_B", "venue_staff"]],
    mfa: false,
  },
  viewA: {
    email: "view-a@e2e.test",
    name: "会場A 閲覧",
    home: "fac_A",
    roles: [["fac_A", "viewer"]],
    mfa: false,
  },
  lockA: {
    email: "lock-a@e2e.test",
    name: "ロック確認",
    home: "fac_A",
    roles: [["fac_A", "venue_staff"]],
    mfa: false,
  },
  stopA: {
    email: "stop-a@e2e.test",
    name: "停止確認",
    home: "fac_A",
    roles: [["fac_A", "venue_staff"]],
    mfa: false,
  },
  roleA: {
    email: "role-a@e2e.test",
    name: "権限変更確認",
    home: "fac_A",
    roles: [["fac_A", "facility_admin"]],
    mfa: true,
  },
} satisfies Record<
  string,
  { email: string; name: string; home: string; roles: [string, Role][]; mfa: boolean }
>;

export type UserKey = keyof typeof USERS;

/** 多要素認証の秘密鍵（テストの中で確認コードを作るため。ローカルの使い捨て DB だけ） */
export const MFA_SECRETS: Partial<Record<UserKey, string>> = {};

export const totp = (key: UserKey) => {
  const secret = MFA_SECRETS[key];
  if (!secret) throw new Error(`${key} の多要素認証が登録されていません`);
  return generateSync({ secret });
};

export async function facilityIds(): Promise<Record<string, string>> {
  const { data } = await admin().from("facility").select("id, code");
  return Object.fromEntries((data ?? []).map((f) => [f.code, f.id]));
}

async function findAuthUser(email: string) {
  const a = admin();
  for (let page = 1; page < 20; page++) {
    const { data } = await a.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** 毎回、同じ状態に作り直す（ロック・停止・権限の変更を元に戻す） */
export async function seed() {
  const a = admin();
  for (const f of FACILITIES) {
    const { error } = await a
      .from("facility")
      .upsert({ code: f.code, kind: f.kind, name: f.name, sub: f.sub }, { onConflict: "code" });
    if (error) throw error;
  }
  const ids = await facilityIds();
  await a.from("facility").update({ monthly_budget_cap_yen: 900000 }).eq("code", "fac_A");

  for (const [key, u] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    let authUser = await findAuthUser(u.email);
    if (authUser) {
      await a.auth.admin.updateUserById(authUser.id, {
        password: E2E_PASSWORD,
        email_confirm: true,
      });
    } else {
      const { data, error } = await a.auth.admin.createUser({
        email: u.email,
        password: E2E_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser");
      authUser = data.user;
    }
    const { error: upErr } = await a.from("app_user").upsert({
      id: authUser.id,
      facility_id: ids[u.home]!,
      email: u.email,
      display_name: u.name,
      status: "active",
      failed_login_count: 0,
      locked_until: null,
      lock_count: 0,
    });
    if (upErr) throw upErr;
    await a.from("user_facility_role").delete().eq("user_id", authUser.id);
    await a
      .from("user_facility_role")
      .insert(
        u.roles.map(([code, role]) => ({ user_id: authUser!.id, facility_id: ids[code]!, role })),
      );

    // 多要素認証：いったん消して登録し直す
    const { data: factors } = await a.auth.admin.mfa.listFactors({ userId: authUser.id });
    for (const f of factors?.factors ?? [])
      await a.auth.admin.mfa.deleteFactor({ userId: authUser.id, id: f.id });
    if (u.mfa) {
      const c = createClient<Database>(env.url, env.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signErr } = await c.auth.signInWithPassword({
        email: u.email,
        password: E2E_PASSWORD,
      });
      if (signErr) throw signErr;
      const { data: enrolled, error: enrollErr } = await c.auth.mfa.enroll({ factorType: "totp" });
      if (enrollErr || !enrolled) throw enrollErr ?? new Error("enroll");
      const secret = enrolled.totp.secret;
      const { error: vErr } = await c.auth.mfa.challengeAndVerify({
        factorId: enrolled.id,
        code: generateSync({ secret }),
      });
      if (vErr) throw vErr;
      MFA_SECRETS[key] = secret;
      await c.auth.signOut();
    }
  }

  // 取込データを空にする（毎回同じ状態から確かめる）
  await a.from("facility_connection").delete().in("facility_id", [ids.fac_A!, ids.fac_B!]);
  for (const t of [
    "market_report",
    "asset",
    "funnel_event",
    "media_daily_metric",
    "crm_lead",
    "transcript_segment",
    "customer_insight",
    "consent_record",
    "consultation_session",
    "import_job",
  ] as const) {
    await a.from(t).delete().in("facility_id", [ids.fac_A!, ids.fac_B!]);
  }
  for (const code of ["fac_A", "fac_B"]) {
    const { data: files } = await a.storage
      .from("facility-files")
      .list(`${ids[code]}/assets/dolphin`);
    if (files?.length)
      await a.storage
        .from("facility-files")
        .remove(files.map((f) => `${ids[code]}/assets/dolphin/${f.name}`));
  }

  // 施設ごとのファイルと操作の記録
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  for (const code of ["fac_A", "fac_B"]) {
    await a.storage
      .from("facility-files")
      .upload(`${ids[code]}/assets/${code}.png`, png, { contentType: "image/png", upsert: true });
    const marker = `E2E：${code} の操作`;
    const { data: exists } = await a
      .from("operation_log")
      .select("id")
      .eq("action", marker)
      .limit(1);
    if (!exists?.length)
      await a.from("operation_log").insert({ facility_id: ids[code]!, action: marker });
  }
  return ids;
}
