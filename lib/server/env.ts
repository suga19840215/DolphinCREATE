import "server-only";
import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const serverEnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  AI_MODEL: optionalSecret,
  CRON_SECRET: optionalSecret,
  CONNECTION_ENCRYPTION_KEY: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** 環境変数を検証して返す。値が足りないときは、どの名前が足りないかだけを示す（値は出さない）。 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`環境変数が正しくありません: ${names}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
