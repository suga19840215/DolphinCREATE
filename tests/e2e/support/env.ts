import { existsSync } from "node:fs";

// 画面テストは、ローカル（または CI）の Supabase に向けて動かす。値は .env.local から読む。
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const env = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

if (!env.url || !env.anonKey || !env.serviceKey) {
  throw new Error(
    "画面テストには .env.local（NEXT_PUBLIC_SUPABASE_URL・NEXT_PUBLIC_SUPABASE_ANON_KEY・SUPABASE_SERVICE_ROLE_KEY）が必要です。npx supabase start の表示から作ってください。",
  );
}

/** テスト用アカウント共通のパスワード（ローカルの使い捨て DB だけで使う） */
export const E2E_PASSWORD = "dolphin-e2e-only-2026";
