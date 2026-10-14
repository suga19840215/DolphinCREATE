import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { appConfig } from "@/config/app";
import { checkAiPayload } from "@/lib/core/ai-guard";
import type { Json } from "../database.types";
import { requireSecret, serverEnv } from "../env";
import { adminClient } from "../supabase";

// Claude API の呼び出し（サーバーからだけ）。CLAUDE.md 7章：
// P0 を先頭に付ける／応答を JSON スキーマで検証する／送った内容・モデル・プロンプトの版・出力を ai_run_log に残す。

export const AI_UNREADABLE = "AIの応答を読めませんでした。";

/** 拒否されたときに、別のモデルで続けてもらう（サーバー側のフォールバック）に対応しているモデル */
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-sonnet-5-5",
]);

const promptCache = new Map<string, string>();
async function prompt(file: string) {
  let text = promptCache.get(file);
  if (!text) {
    text = (await readFile(path.join(process.cwd(), "prompts", file), "utf8")).trim();
    promptCache.set(file, text);
  }
  return text;
}

/** プロンプトの版（ファイル先頭の「版：…」）。記録に残す */
const versionOf = (text: string, file: string) => text.match(/版：([\w.-]+)/)?.[1] ?? file;

export type AiResult<T> = { ok: true; data: T; runId: string } | { ok: false; error: string };

export async function runAi<S extends z.ZodType>(opts: {
  facilityId: string;
  purpose: string;
  promptFile: string;
  /** 送る内容（PDF などのファイル本体は入れず、記録には logInput を残す） */
  content: Anthropic.Beta.BetaContentBlockParam[];
  logInput: { [key: string]: Json | undefined };
  schema: S;
  runBy: string | null;
}): Promise<AiResult<z.infer<S>>> {
  const model = serverEnv().AI_MODEL ?? appConfig.aiModel;
  const [p0, task] = await Promise.all([prompt("p0-common.md"), prompt(opts.promptFile)]);
  const promptVersion = versionOf(task, opts.promptFile);
  const log = async (row: { output: Json | null; schema_valid: boolean; error: string | null }) => {
    const { data } = await adminClient()
      .from("ai_run_log")
      .insert({
        facility_id: opts.facilityId,
        purpose: opts.purpose,
        model,
        prompt_version: promptVersion,
        input: opts.logInput ?? {},
        run_by: opts.runBy,
        ...row,
      })
      .select("id")
      .single();
    return data?.id ?? "";
  };

  // 送る前の検査：連絡先（メール・電話番号）が混ざっていれば送らない（受入テスト10）
  const texts = opts.content.flatMap((b) => (b.type === "text" ? [b.text] : []));
  const issues = checkAiPayload(
    { facility_id: opts.facilityId, texts },
    { facilityId: opts.facilityId, otherFacilityKeys: [] },
  );
  if (issues.length) {
    await log({
      output: null,
      schema_valid: false,
      error: `blocked: ${issues.map((i) => i.kind).join(",")}`,
    });
    return { ok: false, error: "送る内容に連絡先が含まれていたため、AI に送りませんでした。" };
  }

  let apiKey: string;
  try {
    apiKey = requireSecret("ANTHROPIC_API_KEY");
  } catch {
    return { ok: false, error: "AI の設定（APIキー）がまだありません。管理者に連絡してください。" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const useFallback = FALLBACK_MODELS.has(model);
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: `${p0}\n\n${task}`,
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: "medium", format: betaZodOutputFormat(opts.schema) },
      ...(useFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    });
    if (response.stop_reason === "refusal" || response.parsed_output == null) {
      await log({
        output: null,
        schema_valid: false,
        error: `stop_reason=${response.stop_reason}`,
      });
      return { ok: false, error: AI_UNREADABLE };
    }
    const data = response.parsed_output as z.infer<S>;
    const runId = await log({ output: data as Json, schema_valid: true, error: null });
    return { ok: true, data, runId };
  } catch (e) {
    // 応答がスキーマに合わない（AnthropicError）・API の失敗。中身は記録だけに残し、画面には決まった文言を出す
    const message =
      e instanceof Anthropic.APIError
        ? `API ${e.status ?? ""}`
        : e instanceof Error
          ? e.message.slice(0, 300)
          : "unknown";
    await log({ output: null, schema_valid: false, error: message });
    if (e instanceof Anthropic.RateLimitError)
      return { ok: false, error: "AI が混み合っています。少し待ってからやり直してください。" };
    return { ok: false, error: AI_UNREADABLE };
  }
}
