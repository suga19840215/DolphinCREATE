import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { requireSecret, serverEnv } from "./env";

/**
 * ログインした人の権限で DB に問い合わせるクライアント。行ごとのアクセス制限（RLS）が必ず効く。
 * 画面に出すデータは、原則としてこのクライアントで読む。
 */
export async function userClient() {
  const store = await cookies();
  return createServerClient<Database>(
    serverEnv().NEXT_PUBLIC_SUPABASE_URL,
    requireSecret("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Server Component からは cookie を書けない。更新は proxy.ts が行う。
          }
        },
      },
    },
  );
}

/**
 * 全権限キーのクライアント。RLS を通らないので、使うのは
 * 「サーバーで権限を確かめたあとの書き込み（利用者の発行・履歴の記録など）」だけにする。
 * 呼び出し側で必ず facility_id を条件に入れること。
 */
export function adminClient() {
  return createClient<Database>(
    serverEnv().NEXT_PUBLIC_SUPABASE_URL,
    requireSecret("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
